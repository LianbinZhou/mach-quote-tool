/**
 * 机加工报价计算器 - 应用逻辑
 * 公式库：@usethink/mach-calculators v0.1.4（vendored，未声明开源协议，仅供本地使用）
 */
import {
  MACHINE_RATE_TABLE,
  calculateProcessingFee,
  calculateMaterialWeight,
  calculateMaterialFee,
  calculateComprehensiveQuote,
} from '../vendor/mach-calculators/dist/index.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

/* ═ 工序定义 ═ */
const PROCESS_FIELDS = [
  { key: 'cncTurning',   label: 'CNC 车削中心', rate: 35 },
  { key: 'cncMilling',   label: 'CNC 铣削中心', rate: 35 },
  { key: 'wireCutSlow',  label: '慢走丝线割',  rate: 30 },
  { key: 'wireCutFast',  label: '快走丝线割',  rate: 15 },
  { key: 'edm',          label: '放电加工（EDM）', rate: 28 },
  { key: 'grinding',     label: '磨床',        rate: 25 },
  { key: 'conventional', label: '手动车/铣床', rate: 18 },
];
// 记录每个工序的费率（可手动改）与费用是否被手动锁定
const processState = {};
PROCESS_FIELDS.forEach(f => { processState[f.key] = { rate: f.rate, manual: false }; });

function renderMachineInputs() {
  $('machine-inputs').innerHTML = PROCESS_FIELDS.map(f => `
    <div class="machine-row" data-key="${f.key}">
      <span class="m-label">${f.label}</span>
      <span class="m-fields">
        <span class="m-field"><input type="number" min="0" step="0.1" data-hours="${f.key}" placeholder="0"><small>工时h</small></span>
        <span class="m-field"><input type="number" min="0" step="0.1" data-rate="${f.key}" value="${f.rate}"><small>元/h</small></span>
        <span class="m-field fee"><input type="number" min="0" step="0.01" data-fee="${f.key}" value="0"><small>费用元</small></span>
      </span>
    </div>`).join('');

  document.querySelectorAll('[data-hours]').forEach(el =>
    el.addEventListener('input', onProcessInput)
  );
  document.querySelectorAll('[data-rate]').forEach(el =>
    el.addEventListener('input', onProcessInput)
  );
  document.querySelectorAll('[data-fee]').forEach(el => {
    el.addEventListener('input', onProcessInput);
    // 手动改费用 → 锁定，不再被自动计算覆盖
    el.addEventListener('change', () => {
      const key = el.dataset.fee;
      processState[key].manual = true;
      el.classList.add('manual');
    });
  });
}

function autoCalcOne(key) {
  // 若该工序费用被手动锁定，则不覆盖
  if (processState[key].manual) return;
  const hours = parseFloat(document.querySelector(`[data-hours="${key}"]`).value) || 0;
  const rate = parseFloat(document.querySelector(`[data-rate="${key}"]`).value) || processState[key].rate;
  const fee = hours * rate;
  document.querySelector(`[data-fee="${key}"]`).value = fmt(fee);
}

function onProcessInput(e) {
  const key = e.target.dataset.hours || e.target.dataset.rate || e.target.dataset.fee;
  // 改工时/费率时，重新自动算对应工序费用
  if (e.target.dataset.hours || e.target.dataset.rate) autoCalcOne(key);
  updateProcessing();
}

function updateProcessing() {
  let total = 0;
  PROCESS_FIELDS.forEach(f => {
    const fee = parseFloat(document.querySelector(`[data-fee="${f.key}"]`).value) || 0;
    total += fee;
  });
  $('processing-fee').textContent = fmt(total);
  // 加工费汇总自动流入综合报价（若用户未手动改过 q-processing）
  if (!$('q-processing').dataset.manual) $('q-processing').value = fmt(total);
  updateQuote();
}

function resetFees() {
  PROCESS_FIELDS.forEach(f => {
    processState[f.key].manual = false;
    const feeInput = document.querySelector(`[data-fee="${f.key}"]`);
    feeInput.value = '0';
    feeInput.classList.remove('manual');
    document.querySelector(`[data-rate="${f.key}"]`).value = f.rate;
  });
  updateProcessing();
}

/* ═ 材料费计算 ═ */
const DIM_LABELS = {
  length: '长度 L（mm）',
  width: '宽度 W（mm）',
  height: '高度 H（mm）',
  outerDiameter: '外径 D（mm）',
  innerDiameter: '内径 d（mm）',
};
const SHAPE_DIMS = {
  square: ['length', 'width', 'height'],
  round: ['outerDiameter', 'length'],
  tube: ['outerDiameter', 'innerDiameter', 'length'],
};

function renderDimensionInputs() {
  const shape = $('blank-shape').value;
  const dims = SHAPE_DIMS[shape];
  $('dimension-inputs').innerHTML = dims.map(d => `
    <label>${DIM_LABELS[d]}<input type="number" min="0" step="0.1" data-dim="${d}" placeholder="0"></label>`
  ).join('');
  document.querySelectorAll('[data-dim]').forEach(el =>
    el.addEventListener('input', updateMaterial)
  );
  updateMaterial();
}

function updateMaterial() {
  const material = $('material-type').value;
  const shape = $('blank-shape').value;
  const params = { material };
  document.querySelectorAll('[data-dim]').forEach(el => {
    params[el.dataset.dim] = parseFloat(el.value) || 0;
  });
  const weight = calculateMaterialWeight(shape, params);
  const fee = calculateMaterialFee(weight, material);
  $('material-weight').textContent = weight;
  $('material-fee').textContent = fmt(fee);
  if (!$('q-material').dataset.manual) $('q-material').value = fmt(fee);
  updateQuote();
}

/* ═ 综合报价 ═ */
function getQuoteParams() {
  return {
    processingFee: parseFloat($('q-processing').value) || 0,
    materialFee: parseFloat($('q-material').value) || 0,
    complexity: $('q-complexity').value,
    precision: $('q-precision').value,
    surface: $('q-surface').value,
    batchSize: parseInt($('q-batch').value) || 1,
    profitMargin: (parseFloat($('q-profit').value) || 0) / 100,
    taxRate: (parseFloat($('q-tax').value) || 0) / 100,
  };
}

function updateQuote() {
  const result = calculateComprehensiveQuote(getQuoteParams());
  $('r-subtotal').textContent = fmt(result.subTotal) + ' 元';
  $('r-factor').textContent = '× ' + result.compositeFactor;
  $('r-adjusted').textContent = fmt(result.adjustedFee) + ' 元';
  $('r-final').textContent = fmt(result.finalQuote) + ' 元';
  $('r-batch-label').textContent = $('q-batch').value || 1;
  $('r-unit').textContent = fmt(result.finalQuote / (parseInt($('q-batch').value) || 1)) + ' 元';
}

/* ═ 生成明细报价单 ═ */
function getSelectedLabel(selId) {
  const sel = $(selId);
  return sel.options[sel.selectedIndex].text;
}

function buildQuoteSheet() {
  const params = getQuoteParams();
  const result = calculateComprehensiveQuote(params);
  const batch = parseInt($('q-batch').value) || 1;
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN');
  const docNo = 'Q' + now.getTime().toString().slice(-10);

  // 工序明细
  const processRows = PROCESS_FIELDS.map(f => {
    const hours = parseFloat(document.querySelector(`[data-hours="${f.key}"]`).value) || 0;
    const rate = parseFloat(document.querySelector(`[data-rate="${f.key}"]`).value) || 0;
    const fee = parseFloat(document.querySelector(`[data-fee="${f.key}"]`).value) || 0;
    if (hours <= 0 && fee <= 0) return '';
    return `<tr>
      <td>${f.label}${processState[f.key].manual ? ' ⚙️' : ''}</td>
      <td>${hours || 0}</td>
      <td>${fmt(rate)}</td>
      <td>${fmt(fee)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="empty">（未填工序）</td></tr>';

  // 材料明细
  const material = $('material-type').value;
  const shape = $('blank-shape').value;
  const dims = SHAPE_DIMS[shape].map(d => `${document.querySelector(`[data-dim="${d}"]`).value || 0}mm`).join(' × ');
  const weight = $('material-weight').textContent;
  const materialFee = $('material-fee').textContent;

  // 乘数明细
  const kDesc = {
    simple: '简单 ×1.0', medium: '中等 ×1.2', complex: '复杂 ×1.5', ultra_complex: '超复杂 ×2.0'
  };
  const pDesc = {
    general: '一般(IT12-13) ×1.0', medium: '中等(IT11-12) ×1.15', high: '高(IT9-10) ×1.35', ultra_high: '超高(IT6-8) ×1.6'
  };
  const sDesc = {
    general: '一般 ×1.0', medium: '中等 ×1.1', fine: '细 ×1.25', ultra_fine: '超细 ×1.5', mirror: '镜面 ×1.8'
  };

  $('quote-sheet').innerHTML = `
    <div class="sheet">
      <div class="sheet-head">
        <h3>机加工报价单</h3>
        <div class="sheet-meta"><span>单号：${docNo}</span><span>日期：${dateStr}</span></div>
      </div>

      <h4>一、工序明细</h4>
      <table class="sheet-table">
        <thead><tr><th>工序</th><th>工时(h)</th><th>费率(元/h)</th><th>费用(元)</th></tr></thead>
        <tbody>${processRows}</tbody>
      </table>

      <h4>二、材料明细</h4>
      <table class="sheet-table">
        <tbody>
          <tr><td>材料类型</td><td>${material}</td></tr>
          <tr><td>毛坯形状</td><td>${shape}</td></tr>
          <tr><td>毛坯尺寸</td><td>${dims}</td></tr>
          <tr><td>材料重量</td><td>${weight} kg</td></tr>
          <tr><td>材料费</td><td>${materialFee} 元</td></tr>
        </tbody>
      </table>

      <h4>三、报价计算</h4>
      <table class="sheet-table">
        <tbody>
          <tr><td>加工费</td><td>${fmt(params.processingFee)} 元</td></tr>
          <tr><td>材料费</td><td>${fmt(params.materialFee)} 元</td></tr>
          <tr><td>小计（加工 + 材料）</td><td>${fmt(result.subTotal)} 元</td></tr>
          <tr><td>复杂程度（K1）</td><td>${kDesc[params.complexity]}</td></tr>
          <tr><td>精度等级（K2）</td><td>${pDesc[params.precision]}</td></tr>
          <tr><td>表面粗糙度（K3）</td><td>${sDesc[params.surface]}</td></tr>
          <tr><td>批量系数（K4，${batch}件）</td><td>${describeBatch(batch)}</td></tr>
          <tr><td>综合乘数（K1×K2×K3×K4）</td><td>${result.compositeFactor}</td></tr>
          <tr><td>调整后费用</td><td>${fmt(result.adjustedFee)} 元</td></tr>
          <tr><td>利润率</td><td>${(params.profitMargin * 100).toFixed(1)}%</td></tr>
          <tr><td>税率</td><td>${(params.taxRate * 100).toFixed(1)}%</td></tr>
        </tbody>
      </table>

      <div class="sheet-total">
        <div class="sheet-total-row"><span>💰 最终报价（含税，共 ${batch} 件）</span><strong>${fmt(result.finalQuote)} 元</strong></div>
        <div class="sheet-total-row"><span>📦 单件价格</span><strong>${fmt(result.finalQuote / batch)} 元</strong></div>
      </div>

      <p class="sheet-note">本报价单由「机加工报价计算器」自动生成，仅供参考，最终以双方确认为准。</p>
    </div>`;
  $('card-quote-sheet').classList.remove('collapsed');
}

function describeBatch(n) {
  if (n <= 1) return '单件 ×2.0';
  if (n <= 50) return '小批量 ×1.5';
  if (n <= 500) return '中批量 ×1.2';
  if (n <= 10000) return '大批量 ×1.0';
  return '大量生产 ×0.85';
}

/* ═ 参考表 ═ */
function renderRateTable() {
  $('rate-table').querySelector('tbody').innerHTML = MACHINE_RATE_TABLE
    .map(r => `<tr><td>${r.description}</td><td>${r.rate}</td><td>${r.commonParts}</td></tr>`)
    .join('');
}

/* ═ 折叠 ═ */
function toggleCard(id) {
  document.getElementById(id).classList.toggle('collapsed');
}

/* ═ 初始化 ═ */
document.addEventListener('DOMContentLoaded', () => {
  renderMachineInputs();
  renderDimensionInputs();
  renderRateTable();
  updateQuote();

  $('blank-shape').addEventListener('change', renderDimensionInputs);
  $('btn-reset-fees').addEventListener('click', resetFees);
  $('btn-generate').addEventListener('click', buildQuoteSheet);
  $('btn-print').addEventListener('click', () => window.print());

  // 加工费/材料费的手动修改锁定
  ['q-processing', 'q-material'].forEach(id => {
    $(id).addEventListener('input', () => {
      $(id).dataset.manual = 'true';
      $(id).classList.add('manual');
      updateQuote();
    });
  });

  ['q-batch', 'q-profit', 'q-tax'].forEach(id =>
    $(id).addEventListener('input', updateQuote)
  );
  ['q-complexity', 'q-precision', 'q-surface'].forEach(id =>
    $(id).addEventListener('change', updateQuote)
  );
});
