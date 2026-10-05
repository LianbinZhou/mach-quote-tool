/**
 * 机加工报价计算器 - 应用逻辑
 * 公式库：@usethink/mach-calculators v0.1.4（vendored，未声明开源协议，仅供本地使用）
 *
 * 说明：材料价格/密度、复杂/精度/表面系数、批量系数均可手动修改。
 * 库提供的数值仅作为“基准值”，用户改后以手改值为准。
 */
import {
  MACHINE_RATE_TABLE,
  MATERIAL_DENSITY,
  MATERIAL_UNIT_PRICE,
  COMPLEXITY_FACTOR,
  PRECISION_FACTOR,
  SURFACE_FACTOR,
  BATCH_FACTOR,
} from '../vendor/mach-calculators/dist/index.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

/* ═ 标准工序定义 ═ */
const PROCESS_FIELDS = [
  { key: 'cncTurning',   label: 'CNC 车削中心', rate: 35 },
  { key: 'cncMilling',   label: 'CNC 铣削中心', rate: 35 },
  { key: 'wireCutSlow',  label: '慢走丝线割',  rate: 30 },
  { key: 'wireCutFast',  label: '快走丝线割',  rate: 15 },
  { key: 'edm',          label: '放电加工（EDM）', rate: 28 },
  { key: 'grinding',     label: '磨床',        rate: 25 },
  { key: 'conventional', label: '手动车/铣床', rate: 18 },
];
const processState = {};
PROCESS_FIELDS.forEach(f => { processState[f.key] = { rate: f.rate, manual: false }; });

function renderMachineInputs() {
  $('machine-inputs').innerHTML = PROCESS_FIELDS.map(f => `
    <div class="machine-row">
      <span class="m-label">${f.label}</span>
      <span class="m-fields">
        <span class="m-field"><input type="number" min="0" step="0.1" data-hours="${f.key}" placeholder="0"><small>工时h</small></span>
        <span class="m-field"><input type="number" min="0" step="0.1" data-rate="${f.key}" value="${f.rate}"><small>元/h</small></span>
        <span class="m-field fee"><input type="number" min="0" step="0.01" data-fee="${f.key}" value="0"><small>费用元</small></span>
      </span>
    </div>`).join('');

  document.querySelectorAll('[data-hours]').forEach(el => el.addEventListener('input', onProcessInput));
  document.querySelectorAll('[data-rate]').forEach(el => el.addEventListener('input', onProcessInput));
  document.querySelectorAll('[data-fee]').forEach(el => {
    el.addEventListener('input', onProcessInput);
    el.addEventListener('change', () => {
      processState[el.dataset.fee].manual = true;
      el.classList.add('manual');
    });
  });
}

function autoCalcOne(key) {
  if (processState[key].manual) return;
  const hours = parseFloat(document.querySelector(`[data-hours="${key}"]`).value) || 0;
  const rate = parseFloat(document.querySelector(`[data-rate="${key}"]`).value) || processState[key].rate;
  document.querySelector(`[data-fee="${key}"]`).value = fmt(hours * rate);
}

function onProcessInput(e) {
  const key = e.target.dataset.hours || e.target.dataset.rate || e.target.dataset.fee;
  if (e.target.dataset.hours || e.target.dataset.rate) autoCalcOne(key);
  updateProcessing();
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

/* ═ 自定义工序 ═ */
let customProcesses = [];

function addCustomProcess() {
  const id = 'cp_' + Date.now();
  customProcesses.push({ id, name: '', fee: '' });
  renderCustomProcesses();
  updateProcessing();
}

function renderCustomProcesses() {
  const wrap = $('custom-process-inputs');
  if (customProcesses.length === 0) {
    wrap.innerHTML = '<div class="empty-hint">还没有自定义工序，点上方「➕ 添加一行」。</div>';
    return;
  }
  wrap.innerHTML = customProcesses.map(cp => `
    <div class="custom-row">
      <input type="text" data-name="${cp.id}" placeholder="工序名称" value="${cp.name}">
      <input type="number" data-fee="${cp.id}" min="0" step="0.01" placeholder="费用(元)" value="${cp.fee}">
      <button class="btn btn-del" data-del="${cp.id}" title="删除">✕</button>
    </div>`).join('');

  wrap.querySelectorAll('[data-name]').forEach(el => el.addEventListener('input', e => {
    const cp = customProcesses.find(x => x.id === e.target.dataset.name);
    if (cp) cp.name = e.target.value;
  }));
  wrap.querySelectorAll('[data-fee]').forEach(el => el.addEventListener('input', e => {
    const cp = customProcesses.find(x => x.id === e.target.dataset.fee);
    if (cp) cp.fee = e.target.value;
    updateProcessing();
  }));
  wrap.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', e => {
    customProcesses = customProcesses.filter(x => x.id !== e.target.dataset.del);
    renderCustomProcesses();
    updateProcessing();
  }));
}

function updateProcessing() {
  let total = 0;
  PROCESS_FIELDS.forEach(f => { total += parseFloat(document.querySelector(`[data-fee="${f.key}"]`).value) || 0; });
  customProcesses.forEach(cp => { total += parseFloat(cp.fee) || 0; });
  $('processing-fee').textContent = fmt(total);
  if (!$('q-processing').dataset.manual) $('q-processing').value = fmt(total);
  updateQuote();
}

/* ═ 材料：类型基准价，可手改价格/密度/牌号 ═ */
const materialOverride = {};   // 每种类型记住手改的价格/密度
const DIM_LABELS = {
  length: '长度 L（mm）', width: '宽度 W（mm）', height: '高度 H（mm）',
  outerDiameter: '外径 D（mm）', innerDiameter: '内径 d（mm）',
};
const SHAPE_DIMS = {
  square: ['length', 'width', 'height'],
  round: ['outerDiameter', 'length'],
  tube: ['outerDiameter', 'innerDiameter', 'length'],
};

function applyMaterialBase() {
  const mat = $('material-type').value;
  const ov = materialOverride[mat] || {};
  $('material-price').value = ov.price !== undefined ? ov.price : MATERIAL_UNIT_PRICE[mat];
  $('material-density').value = ov.density !== undefined ? ov.density : MATERIAL_DENSITY[mat];
  updateMaterial();
}

function renderDimensionInputs() {
  const shape = $('blank-shape').value;
  const dims = SHAPE_DIMS[shape];
  $('dimension-inputs').innerHTML = dims.map(d => `
    <label>${DIM_LABELS[d]}<input type="number" min="0" step="0.1" data-dim="${d}" placeholder="0"></label>`
  ).join('');
  document.querySelectorAll('[data-dim]').forEach(el => el.addEventListener('input', updateMaterial));
  updateMaterial();
}

function calcWeight(shape, params, density) {
  let volume;                       // mm³
  if (shape === 'square') volume = (params.length || 0) * (params.width || 0) * (params.height || 0);
  else if (shape === 'round') { const r = (params.outerDiameter || 0) / 2; volume = Math.PI * r * r * (params.length || 0); }
  else if (shape === 'tube') { const R = (params.outerDiameter || 0) / 2, r = (params.innerDiameter || 0) / 2; volume = Math.PI * (R * R - r * r) * (params.length || 0); }
  else volume = 0;
  const kg = volume * density / 1e6;   // mm³ × g/cm³ / 1e6 = kg
  return Math.round(kg * 1000) / 1000;
}

function updateMaterial() {
  const mat = $('material-type').value;
  const shape = $('blank-shape').value;
  const density = parseFloat($('material-density').value) || MATERIAL_DENSITY[mat] || 7.85;
  const price = parseFloat($('material-price').value) || MATERIAL_UNIT_PRICE[mat] || 0;
  const params = { material: mat };
  document.querySelectorAll('[data-dim]').forEach(el => { params[el.dataset.dim] = parseFloat(el.value) || 0; });
  const weight = calcWeight(shape, params, density);
  const fee = weight * price;
  $('material-weight').textContent = weight;
  $('material-fee').textContent = fmt(fee);
  if (!$('q-material').dataset.manual) $('q-material').value = fmt(fee);
  updateQuote();
}

/* ═ 综合报价：K 系数可改，默认带基准 ═ */
function batchFactorFor(n) {
  if (n <= 1) return BATCH_FACTOR.single;
  if (n <= 50) return BATCH_FACTOR.small;
  if (n <= 500) return BATCH_FACTOR.medium;
  if (n <= 10000) return BATCH_FACTOR.large;
  return BATCH_FACTOR.mass;
}

// 带出基准系数；force=true 时覆盖手改值并解除锁定
function setK(id, val, force = false) {
  const el = $(id);
  if (force || !el.dataset.manual) {
    el.value = val;
    if (force) { el.dataset.manual = ''; el.classList.remove('manual'); }
  }
}

function syncKDefaults() {
  setK('q-k1', COMPLEXITY_FACTOR[$('q-complexity').value]);
  setK('q-k2', PRECISION_FACTOR[$('q-precision').value]);
  setK('q-k3', SURFACE_FACTOR[$('q-surface').value]);
  setK('q-k4', batchFactorFor(parseInt($('q-batch').value) || 1));
}

function computeQuote() {
  const processingFee = parseFloat($('q-processing').value) || 0;
  const materialFee = parseFloat($('q-material').value) || 0;
  const k1 = parseFloat($('q-k1').value) || 1;
  const k2 = parseFloat($('q-k2').value) || 1;
  const k3 = parseFloat($('q-k3').value) || 1;
  const k4 = parseFloat($('q-k4').value) || 1;
  const batch = parseInt($('q-batch').value) || 1;
  const profitMargin = (parseFloat($('q-profit').value) || 0) / 100;
  const taxRate = (parseFloat($('q-tax').value) || 0) / 100;

  const subTotal = processingFee + materialFee;
  const compositeFactor = Math.round(k1 * k2 * k3 * k4 * 1000) / 1000;
  const adjustedFee = Math.round(subTotal * compositeFactor * 100) / 100;
  const finalQuote = Math.round(adjustedFee * (1 + profitMargin) * (1 + taxRate) * 100) / 100;
  return { subTotal, compositeFactor, adjustedFee, finalQuote, batch, profitMargin, taxRate };
}

function updateQuote() {
  const result = computeQuote();
  $('r-subtotal').textContent = fmt(result.subTotal) + ' 元';
  $('r-factor').textContent = '× ' + result.compositeFactor;
  $('r-adjusted').textContent = fmt(result.adjustedFee) + ' 元';
  $('r-final').textContent = fmt(result.finalQuote) + ' 元';
  $('r-batch-label').textContent = result.batch;
  $('r-unit').textContent = fmt(result.finalQuote / result.batch) + ' 元';
}

/* ═ 生成明细报价单 ═ */
function getSelectedLabel(selId) {
  const sel = $(selId);
  return sel.options[sel.selectedIndex].text;
}

function buildQuoteSheet() {
  const result = computeQuote();
  const batch = result.batch;
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN');
  const docNo = 'Q' + now.getTime().toString().slice(-10);

  const processRows = PROCESS_FIELDS.map(f => {
    const hours = parseFloat(document.querySelector(`[data-hours="${f.key}"]`).value) || 0;
    const rate = parseFloat(document.querySelector(`[data-rate="${f.key}"]`).value) || 0;
    const fee = parseFloat(document.querySelector(`[data-fee="${f.key}"]`).value) || 0;
    if (hours <= 0 && fee <= 0) return '';
    return `<tr><td>${f.label}${processState[f.key].manual ? ' ⚙️' : ''}</td><td>${hours || 0}</td><td>${fmt(rate)}</td><td>${fmt(fee)}</td></tr>`;
  }).join('');

  const customRows = customProcesses.filter(cp => (cp.name || cp.fee)).map(cp => {
    return `<tr><td>${cp.name || '（未命名）'} ⚙️</td><td>—</td><td>—</td><td>${fmt(parseFloat(cp.fee) || 0)}</td></tr>`;
  }).join('');

  const mat = $('material-type').value;
  const grade = $('material-grade').value.trim();
  const shape = $('blank-shape').value;
  const dims = SHAPE_DIMS[shape].map(d => `${document.querySelector(`[data-dim="${d}"]`).value || 0}mm`).join(' × ');
  const price = $('material-price').value;
  const density = $('material-density').value;
  const weight = $('material-weight').textContent;
  const materialFee = $('material-fee').textContent;

  const kDesc = { simple: '简单', medium: '中等', complex: '复杂', ultra_complex: '超复杂' };
  const pDesc = { general: '一般(IT12-13)', medium: '中等(IT11-12)', high: '高(IT9-10)', ultra_high: '超高(IT6-8)' };
  const sDesc = { general: '一般', medium: '中等', fine: '细', ultra_fine: '超细', mirror: '镜面' };

  $('quote-sheet').innerHTML = `
    <div class="sheet">
      <div class="sheet-head">
        <h3>机加工报价单</h3>
        <div class="sheet-meta"><span>单号：${docNo}</span><span>日期：${dateStr}</span></div>
      </div>

      <h4>一、工序明细</h4>
      <table class="sheet-table">
        <thead><tr><th>工序</th><th>工时(h)</th><th>费率(元/h)</th><th>费用(元)</th></tr></thead>
        <tbody>${processRows}${customRows}</tbody>
      </table>

      <h4>二、材料明细</h4>
      <table class="sheet-table">
        <tbody>
          <tr><td>材料类型</td><td>${mat}</td></tr>
          ${grade ? `<tr><td>材料牌号</td><td>${grade}</td></tr>` : ''}
          <tr><td>毛坯形状</td><td>${shape}</td></tr>
          <tr><td>毛坯尺寸</td><td>${dims}</td></tr>
          <tr><td>材料单价</td><td>${price} 元/kg</td></tr>
          <tr><td>材料密度</td><td>${density} g/cm³</td></tr>
          <tr><td>材料重量</td><td>${weight} kg</td></tr>
          <tr><td>材料费</td><td>${materialFee} 元</td></tr>
        </tbody>
      </table>

      <h4>三、报价计算</h4>
      <table class="sheet-table">
        <tbody>
          <tr><td>加工费</td><td>${fmt(parseFloat($('q-processing').value) || 0)} 元</td></tr>
          <tr><td>材料费</td><td>${fmt(parseFloat($('q-material').value) || 0)} 元</td></tr>
          <tr><td>小计（加工 + 材料）</td><td>${fmt(result.subTotal)} 元</td></tr>
          <tr><td>复杂程度（K1）</td><td>${kDesc[$('q-complexity').value]} × ${$('q-k1').value}</td></tr>
          <tr><td>精度等级（K2）</td><td>${pDesc[$('q-precision').value]} × ${$('q-k2').value}</td></tr>
          <tr><td>表面粗糙度（K3）</td><td>${sDesc[$('q-surface').value]} × ${$('q-k3').value}</td></tr>
          <tr><td>批量（${batch} 件）系数 K4</td><td>× ${$('q-k4').value}</td></tr>
          <tr><td>综合乘数（K1×K2×K3×K4）</td><td>${result.compositeFactor}</td></tr>
          <tr><td>调整后费用</td><td>${fmt(result.adjustedFee)} 元</td></tr>
          <tr><td>利润率</td><td>${(result.profitMargin * 100).toFixed(1)}%</td></tr>
          <tr><td>税率</td><td>${(result.taxRate * 100).toFixed(1)}%</td></tr>
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
  renderCustomProcesses();
  renderDimensionInputs();
  applyMaterialBase();      // 先按当前材料类型填充价格/密度基准
  renderRateTable();
  syncKDefaults();
  updateQuote();

  $('blank-shape').addEventListener('change', renderDimensionInputs);
  $('material-type').addEventListener('change', applyMaterialBase);
  $('btn-add-process').addEventListener('click', addCustomProcess);
  $('btn-reset-fees').addEventListener('click', resetFees);
  $('btn-generate').addEventListener('click', buildQuoteSheet);
  $('btn-print').addEventListener('click', () => window.print());

  // 材料价格/密度手动改 → 记住该类型的手改值
  ['material-price', 'material-density'].forEach(id => {
    $(id).addEventListener('input', () => {
      const mat = $('material-type').value;
      materialOverride[mat] = materialOverride[mat] || {};
      materialOverride[mat][id.replace('material-', '')] = parseFloat($(id).value) || 0;
      $(id).classList.add('manual');
      updateMaterial();
    });
  });

  // 加工费/材料费汇总手改锁定
  ['q-processing', 'q-material'].forEach(id => {
    $(id).addEventListener('input', () => {
      $(id).dataset.manual = 'true';
      $(id).classList.add('manual');
      updateQuote();
    });
  });

  // K 系数手改锁定
  ['q-k1', 'q-k2', 'q-k3', 'q-k4'].forEach(id => {
    $(id).addEventListener('input', () => {
      $(id).dataset.manual = 'true';
      $(id).classList.add('manual');
      updateQuote();
    });
  });

  // 档位变化 → 强制带出该档基准系数（换档位即以新基准为准）
  $('q-complexity').addEventListener('change', () => { setK('q-k1', COMPLEXITY_FACTOR[$('q-complexity').value], true); updateQuote(); });
  $('q-precision').addEventListener('change', () => { setK('q-k2', PRECISION_FACTOR[$('q-precision').value], true); updateQuote(); });
  $('q-surface').addEventListener('change', () => { setK('q-k3', SURFACE_FACTOR[$('q-surface').value], true); updateQuote(); });
  // 批量变化 → K4 若未被手改则跟随批量档位
  $('q-batch').addEventListener('input', () => { setK('q-k4', batchFactorFor(parseInt($('q-batch').value) || 1)); updateQuote(); });

  ['q-profit', 'q-tax'].forEach(id =>
    $(id).addEventListener('input', updateQuote)
  );
});
