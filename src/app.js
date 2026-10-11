/**
 * 机加工报价计算器 - 应用逻辑（状态 + 渲染 + 事件绑定）
 * 纯计算集中在 src/calc.js；公式默认值来自 vendor/@usethink/mach-calculators。
 *
 * 说明：材料价格/密度、复杂/精度/表面系数、批量系数均可手动修改。
 * 库提供的数值仅作为「基准值」，用户改后以手改值为准。
 */
import {
  MACHINE_RATE_TABLE,
  MATERIAL_DENSITY,
  MATERIAL_UNIT_PRICE,
  COMPLEXITY_FACTOR,
  PRECISION_FACTOR,
  SURFACE_FACTOR,
} from '../vendor/mach-calculators/dist/index.js';
import {
  batchFactorFor,
  computeQuote,
  materialFee,
  materialWeight,
  processingFee,
} from './calc.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

/** 转义用户输入，避免拼进 innerHTML / 属性时破坏结构或注入脚本。 */
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

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
PROCESS_FIELDS.forEach((f) => { processState[f.key] = { rate: f.rate, manual: false }; });

function renderMachineInputs() {
  $('machine-inputs').innerHTML = PROCESS_FIELDS.map((f) => `
    <div class="machine-row">
      <span class="m-label">${f.label}</span>
      <span class="m-fields">
        <span class="m-field"><input type="number" min="0" step="0.1" data-hours="${f.key}" placeholder="0"><small>工时h</small></span>
        <span class="m-field"><input type="number" min="0" step="0.1" data-rate="${f.key}" value="${f.rate}"><small>元/h</small></span>
        <span class="m-field fee"><input type="number" min="0" step="0.01" data-fee="${f.key}" value="0" title="可手动修改，手动修改后标记为 ⚙️"><small>费用元</small></span>
      </span>
    </div>`).join('');

  document.querySelectorAll('[data-hours]').forEach((el) => el.addEventListener('input', onProcessInput));
  document.querySelectorAll('[data-rate]').forEach((el) => el.addEventListener('input', onProcessInput));
  document.querySelectorAll('[data-fee]').forEach((el) => {
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
  PROCESS_FIELDS.forEach((f) => {
    processState[f.key].manual = false;
    const rateInput = document.querySelector(`[data-rate="${f.key}"]`);
    rateInput.value = f.rate;
    rateInput.classList.remove('manual');
    document.querySelector(`[data-fee="${f.key}"]`).classList.remove('manual');
    autoCalcOne(f.key); // 恢复默认费率后，按当前工时重新计算，而不是清零
  });
  updateProcessing();
}

/* ═ 自定义工序 ═ */
let customProcesses = [];

function addCustomProcess() {
  const id = 'cp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
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
  wrap.innerHTML = customProcesses.map((cp) => `
    <div class="custom-row">
      <input type="text" data-name="${cp.id}" placeholder="工序名称" value="${esc(cp.name)}">
      <input type="number" data-fee="${cp.id}" min="0" step="0.01" placeholder="费用(元)" value="${esc(cp.fee)}">
      <button class="btn btn-del" data-del="${cp.id}" title="删除">✕</button>
    </div>`).join('');

  wrap.querySelectorAll('[data-name]').forEach((el) => el.addEventListener('input', (e) => {
    const cp = customProcesses.find((x) => x.id === e.target.dataset.name);
    if (cp) cp.name = e.target.value;
  }));
  wrap.querySelectorAll('[data-fee]').forEach((el) => el.addEventListener('input', (e) => {
    const cp = customProcesses.find((x) => x.id === e.target.dataset.fee);
    if (cp) cp.fee = e.target.value;
    updateProcessing();
  }));
  wrap.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', (e) => {
    customProcesses = customProcesses.filter((x) => x.id !== e.target.dataset.del);
    renderCustomProcesses();
    updateProcessing();
  }));
}

function updateProcessing() {
  const fees = PROCESS_FIELDS.map(
    (f) => parseFloat(document.querySelector(`[data-fee="${f.key}"]`).value) || 0,
  );
  const total = processingFee([...fees, ...customProcesses.map((cp) => cp.fee)]);
  $('processing-fee').textContent = fmt(total);
  if (!$('q-processing').dataset.manual) $('q-processing').value = fmt(total);
  updateQuote();
}

/* ═ 材料：类型基准价，可手改价格/密度/牌号 ═ */
const materialOverride = {};   // 每种类型记住手改的价格/密度：{ [mat]: { price?, density? } }
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
  const priceEl = $('material-price');
  const densEl = $('material-density');
  priceEl.value = ov.price !== undefined ? ov.price : MATERIAL_UNIT_PRICE[mat];
  densEl.value = ov.density !== undefined ? ov.density : MATERIAL_DENSITY[mat];
  // 依据是否手改来同步高亮，避免切换材料类型后残留旧高亮
  priceEl.classList.toggle('manual', ov.price !== undefined);
  densEl.classList.toggle('manual', ov.density !== undefined);
  updateMaterial();
}

function renderDimensionInputs() {
  const shape = $('blank-shape').value;
  const dims = SHAPE_DIMS[shape];
  $('dimension-inputs').innerHTML = dims.map((d) => `
    <label>${DIM_LABELS[d]}<input type="number" min="0" step="0.1" data-dim="${d}" placeholder="0"></label>`
  ).join('');
  document.querySelectorAll('[data-dim]').forEach((el) => el.addEventListener('input', updateMaterial));
  updateMaterial();
}

function updateMaterial() {
  const mat = $('material-type').value;
  const shape = $('blank-shape').value;
  const ov = materialOverride[mat] || {};
  const densityOverride = ov.density !== undefined ? parseFloat($('material-density').value) : null;
  const priceOverride = ov.price !== undefined ? parseFloat($('material-price').value) : null;

  const params = { material: mat };
  document.querySelectorAll('[data-dim]').forEach((el) => { params[el.dataset.dim] = parseFloat(el.value) || 0; });

  const weight = materialWeight(shape, params, mat, densityOverride);
  const fee = materialFee(weight, mat, priceOverride);

  $('material-weight').textContent = weight;
  $('material-fee').textContent = fmt(fee);
  if (!$('q-material').dataset.manual) $('q-material').value = fmt(fee);
  updateQuote();
}

/* ═ 综合报价：K 系数可改，默认带基准 ═ */
// 带出基准系数；force=true 时覆盖手改值并解除锁定
function setK(id, val, force = false) {
  const el = $(id);
  if (force || !el.dataset.manual) {
    el.value = val;
    if (force) { delete el.dataset.manual; el.classList.remove('manual'); }
  }
}

function syncKDefaults({ force = false } = {}) {
  setK('q-k1', COMPLEXITY_FACTOR[$('q-complexity').value], force);
  setK('q-k2', PRECISION_FACTOR[$('q-precision').value], force);
  setK('q-k3', SURFACE_FACTOR[$('q-surface').value], force);
  setK('q-k4', batchFactorFor(parseInt($('q-batch').value) || 1), force);
}

function readQuoteInputs() {
  return {
    processingFee: parseFloat($('q-processing').value) || 0,
    materialFee: parseFloat($('q-material').value) || 0,
    k1: parseFloat($('q-k1').value) || 1,
    k2: parseFloat($('q-k2').value) || 1,
    k3: parseFloat($('q-k3').value) || 1,
    k4: parseFloat($('q-k4').value) || 1,
    batch: parseInt($('q-batch').value) || 1,
    profitMargin: (parseFloat($('q-profit').value) || 0) / 100,
    taxRate: (parseFloat($('q-tax').value) || 0) / 100,
  };
}

function updateQuote() {
  const result = computeQuote(readQuoteInputs());
  $('r-subtotal').textContent = fmt(result.subTotal) + ' 元';
  $('r-factor').textContent = '× ' + result.compositeFactor;
  $('r-adjusted').textContent = fmt(result.adjustedFee) + ' 元';
  $('r-final').textContent = fmt(result.finalQuote) + ' 元';
  $('r-batch-label').textContent = result.batch;
  $('r-unit').textContent = fmt(result.unitPrice) + ' 元';
}

/* ═ 生成明细报价单 ═ */
function buildQuoteSheet() {
  const result = computeQuote(readQuoteInputs());
  const batch = result.batch;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = now.toLocaleDateString('zh-CN');
  const docNo = `Q${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

  const processRows = PROCESS_FIELDS.map((f) => {
    const hours = parseFloat(document.querySelector(`[data-hours="${f.key}"]`).value) || 0;
    const rate = parseFloat(document.querySelector(`[data-rate="${f.key}"]`).value) || 0;
    const fee = parseFloat(document.querySelector(`[data-fee="${f.key}"]`).value) || 0;
    if (hours <= 0 && fee <= 0) return '';
    return `<tr><td>${f.label}${processState[f.key].manual ? ' ⚙️' : ''}</td><td>${hours || 0}</td><td>${fmt(rate)}</td><td>${fmt(fee)}</td></tr>`;
  }).join('');

  const customRows = customProcesses.filter((cp) => (cp.name || cp.fee)).map((cp) => {
    return `<tr><td>${esc(cp.name) || '（未命名）'} ⚙️</td><td>—</td><td>—</td><td>${fmt(parseFloat(cp.fee) || 0)}</td></tr>`;
  }).join('');

  const mat = $('material-type').value;
  const grade = $('material-grade').value.trim();
  const shape = $('blank-shape').value;
  const dims = SHAPE_DIMS[shape].map((d) => `${document.querySelector(`[data-dim="${d}"]`).value || 0}mm`).join(' × ');
  const price = $('material-price').value;
  const density = $('material-density').value;
  const weight = $('material-weight').textContent;
  const materialFeeText = $('material-fee').textContent;

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
          <tr><td>材料类型</td><td>${esc(mat)}</td></tr>
          ${grade ? `<tr><td>材料牌号</td><td>${esc(grade)}</td></tr>` : ''}
          <tr><td>毛坯形状</td><td>${esc(shape)}</td></tr>
          <tr><td>毛坯尺寸</td><td>${dims}</td></tr>
          <tr><td>材料单价</td><td>${esc(price)} 元/kg</td></tr>
          <tr><td>材料密度</td><td>${esc(density)} g/cm³</td></tr>
          <tr><td>材料重量</td><td>${weight} kg</td></tr>
          <tr><td>材料费</td><td>${materialFeeText} 元</td></tr>
        </tbody>
      </table>

      <h4>三、报价计算</h4>
      <table class="sheet-table">
        <tbody>
          <tr><td>加工费</td><td>${fmt(parseFloat($('q-processing').value) || 0)} 元</td></tr>
          <tr><td>材料费</td><td>${fmt(parseFloat($('q-material').value) || 0)} 元</td></tr>
          <tr><td>小计（加工 + 材料）</td><td>${fmt(result.subTotal)} 元</td></tr>
          <tr><td>复杂程度（K1）</td><td>${kDesc[$('q-complexity').value] || ''} × ${esc($('q-k1').value)}</td></tr>
          <tr><td>精度等级（K2）</td><td>${pDesc[$('q-precision').value] || ''} × ${esc($('q-k2').value)}</td></tr>
          <tr><td>表面粗糙度（K3）</td><td>${sDesc[$('q-surface').value] || ''} × ${esc($('q-k3').value)}</td></tr>
          <tr><td>批量（${batch} 件）系数 K4</td><td>× ${esc($('q-k4').value)}</td></tr>
          <tr><td>综合乘数（K1×K2×K3×K4）</td><td>${result.compositeFactor}</td></tr>
          <tr><td>调整后费用</td><td>${fmt(result.adjustedFee)} 元</td></tr>
          <tr><td>利润率</td><td>${(result.profitMargin * 100).toFixed(1)}%</td></tr>
          <tr><td>税率</td><td>${(result.taxRate * 100).toFixed(1)}%</td></tr>
        </tbody>
      </table>

      <div class="sheet-total">
        <div class="sheet-total-row"><span>💰 最终报价（含税，共 ${batch} 件）</span><strong>${fmt(result.finalQuote)} 元</strong></div>
        <div class="sheet-total-row"><span>📦 单件价格</span><strong>${fmt(result.unitPrice)} 元</strong></div>
      </div>

      <p class="sheet-note">本报价单由「机加工报价计算器」自动生成，仅供参考，最终以双方确认为准。</p>
    </div>`;
  $('card-quote-sheet').classList.remove('collapsed');
}

/* ═ 参考表 ═ */
function renderRateTable() {
  $('rate-table').querySelector('tbody').innerHTML = MACHINE_RATE_TABLE
    .map((r) => `<tr><td>${esc(r.description)}</td><td>${esc(r.rate)}</td><td>${esc(r.commonParts)}</td></tr>`)
    .join('');
}

/* ═ 折叠 ═ */
function toggleCard(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('collapsed');
}

function bindCardToggles() {
  document.querySelectorAll('.card-toggle').forEach((h) => {
    const run = () => toggleCard(h.dataset.target);
    h.addEventListener('click', run);
    h.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); }
    });
  });
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
  bindCardToggles();

  $('blank-shape').addEventListener('change', renderDimensionInputs);
  $('material-type').addEventListener('change', applyMaterialBase);
  $('btn-add-process').addEventListener('click', addCustomProcess);
  $('btn-reset-fees').addEventListener('click', resetFees);
  $('btn-reset-k').addEventListener('click', () => { syncKDefaults({ force: true }); updateQuote(); });
  $('btn-generate').addEventListener('click', buildQuoteSheet);
  $('btn-print').addEventListener('click', () => {
    // 打印前若尚未生成报价单，先生成，避免打印出空白页
    if (!$('quote-sheet').innerHTML.trim()) buildQuoteSheet();
    window.print();
  });

  // 材料价格/密度手动改 → 记住该类型的手改值
  ['material-price', 'material-density'].forEach((id) => {
    $(id).addEventListener('input', () => {
      const mat = $('material-type').value;
      materialOverride[mat] = materialOverride[mat] || {};
      materialOverride[mat][id.replace('material-', '')] = parseFloat($(id).value) || 0;
      $(id).classList.add('manual');
      updateMaterial();
    });
  });

  // 加工费/材料费汇总手改锁定
  ['q-processing', 'q-material'].forEach((id) => {
    $(id).addEventListener('input', () => {
      $(id).dataset.manual = 'true';
      $(id).classList.add('manual');
      updateQuote();
    });
  });

  // K 系数手改锁定
  ['q-k1', 'q-k2', 'q-k3', 'q-k4'].forEach((id) => {
    $(id).addEventListener('input', () => {
      $(id).dataset.manual = 'true';
      $(id).classList.add('manual');
      updateQuote();
    });
  });

  // 档位变化 → 若该 K 未被手改则带出基准值（手改值优先，行为与材料价一致）
  $('q-complexity').addEventListener('change', () => { setK('q-k1', COMPLEXITY_FACTOR[$('q-complexity').value]); updateQuote(); });
  $('q-precision').addEventListener('change', () => { setK('q-k2', PRECISION_FACTOR[$('q-precision').value]); updateQuote(); });
  $('q-surface').addEventListener('change', () => { setK('q-k3', SURFACE_FACTOR[$('q-surface').value]); updateQuote(); });
  $('q-batch').addEventListener('input', () => { setK('q-k4', batchFactorFor(parseInt($('q-batch').value) || 1)); updateQuote(); });

  ['q-profit', 'q-tax'].forEach((id) =>
    $(id).addEventListener('input', updateQuote),
  );
});
