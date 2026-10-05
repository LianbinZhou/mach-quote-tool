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

/* �═ 工序费率输入表 ═ */
const PROCESS_FIELDS = [
  { key: 'cncTurning',   label: 'CNC 车削中心', rate: 35 },
  { key: 'cncMilling',   label: 'CNC 铣削中心', rate: 35 },
  { key: 'wireCutSlow',  label: '慢走丝线割', rate: 30 },
  { key: 'wireCutFast',  label: '快走丝线割', rate: 15 },
  { key: 'edm',          label: '放电加工（EDM）', rate: 28 },
  { key: 'grinding',     label: '磨床', rate: 25 },
  { key: 'conventional', label: '手动车/铣床', rate: 18 },
];

function renderMachineInputs() {
  $('machine-inputs').innerHTML = PROCESS_FIELDS.map(f => `
    <div class="machine-row">
      <span class="m-label">${f.label} <small>${f.rate} 元/时</small></span>
      <span class="m-input"><input type="number" min="0" step="0.1" data-machine="${f.key}" placeholder="0">
      <small>小时</small></span>
    </div>`).join('');
  document.querySelectorAll('[data-machine]').forEach(el =>
    el.addEventListener('input', updateProcessing)
  );
}

function updateProcessing() {
  const times = {};
  document.querySelectorAll('[data-machine]').forEach(el => {
    times[el.dataset.machine] = parseFloat(el.value) || 0;
  });
  const fee = calculateProcessingFee(times);
  $('processing-fee').textContent = fee.toFixed(2);
  $('q-processing').value = fee.toFixed(2);   // 自动流入综合报价
  updateQuote();
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
  $('material-fee').textContent = fee.toFixed(2);
  $('q-material').value = fee.toFixed(2);   // 自动流入综合报价
  updateQuote();
}

/* ═ 综合报价 ═ */
function updateQuote() {
  const result = calculateComprehensiveQuote({
    processingFee: parseFloat($('q-processing').value) || 0,
    materialFee: parseFloat($('q-material').value) || 0,
    complexity: $('q-complexity').value,
    precision: $('q-precision').value,
    surface: $('q-surface').value,
    batchSize: parseInt($('q-batch').value) || 1,
    profitMargin: (parseFloat($('q-profit').value) || 0) / 100,
    taxRate: (parseFloat($('q-tax').value) || 0) / 100,
  });
  $('r-subtotal').textContent = result.subTotal.toFixed(2) + ' 元';
  $('r-factor').textContent = '× ' + result.compositeFactor;
  $('r-adjusted').textContent = result.adjustedFee.toFixed(2) + ' 元';
  $('r-final').textContent = result.finalQuote.toFixed(2) + ' 元';
  $('r-batch-label').textContent = $('q-batch').value || 1;
  $('r-unit').textContent = (result.finalQuote / (parseInt($('q-batch').value) || 1)).toFixed(2) + ' 元';
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
  ['q-processing', 'q-material', 'q-batch', 'q-profit', 'q-tax'].forEach(id =>
    $(id).addEventListener('input', updateQuote)
  );
  ['q-complexity', 'q-precision', 'q-surface'].forEach(id =>
    $(id).addEventListener('change', updateQuote)
  );
});
