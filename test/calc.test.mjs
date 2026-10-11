/**
 * src/calc.js 的单元测试。
 *
 * 核心断言：**当用户未手改任何值时，本工具的计算结果必须与 vendor 公式库逐分一致**。
 * 这样即使将来公式库更新，只要测试通过，就说明本工具仍与库同源。
 *
 * 运行：npm test   （即 node --test test/）
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateMaterialWeight,
  calculateMaterialFee,
  calculateCompositeFactor,
  calculateComprehensiveQuote,
  calculateProcessingFee,
  COMPLEXITY_FACTOR,
  PRECISION_FACTOR,
  SURFACE_FACTOR,
  MATERIAL_DENSITY,
  MATERIAL_UNIT_PRICE,
} from '@usethink/mach-calculators';

import {
  round,
  batchFactorFor,
  materialWeight,
  materialFee,
  processingFee,
  compositeFactor,
  computeQuote,
} from '../src/calc.js';

test('round 处理正常值与非法输入', () => {
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(round('abc'), 0);
  assert.equal(round(null), 0);
  assert.equal(round(3.14159, 3), 3.142);
});

test('materialWeight：默认路径与库一致（方料/圆棒/圆管）', () => {
  const cases = [
    ['square', { material: 'steel', length: 100, width: 50, height: 20 }],
    ['round', { material: 'aluminum', outerDiameter: 60, length: 200 }],
    ['tube', { material: 'stainless_steel', outerDiameter: 60, innerDiameter: 40, length: 200 }],
  ];
  for (const [shape, dims] of cases) {
    assert.equal(
      materialWeight(shape, dims, dims.material),
      calculateMaterialWeight(shape, dims),
      `${shape} 默认重量应与库一致`,
    );
  }
});

test('materialWeight：手改密度按比例换算', () => {
  const dims = { material: 'steel', length: 100, width: 50, height: 20 };
  const base = calculateMaterialWeight('square', dims);
  const custom = 3.0; // 手改密度
  const expected = round(base * (custom / MATERIAL_DENSITY.steel), 3);
  assert.equal(materialWeight('square', dims, 'steel', custom), expected);
});

test('materialFee：默认路径与库一致，手改单价按重量×单价', () => {
  const weight = 12.345;
  assert.equal(materialFee(weight, 'aluminum'), calculateMaterialFee(weight, 'aluminum'));
  assert.equal(materialFee(weight, 'aluminum', 99), round(weight * 99, 2));
});

test('processingFee：默认费率下与库 calculateProcessingFee 一致', () => {
  const times = {
    cncTurning: 2, cncMilling: 1.5, wireCutSlow: 0, wireCutFast: 3,
    edm: 0, grinding: 0.5, conventional: 1,
  };
  // 按库的 MACHINE_RATE 换算成各行费用（CNC车/铣=35，慢走丝=30，快走丝=15，EDM=28，磨=25，手动=18）
  const fees = [
    times.cncTurning * 35, times.cncMilling * 35, times.wireCutSlow * 30,
    times.wireCutFast * 15, times.edm * 28, times.grinding * 25, times.conventional * 18,
  ];
  assert.equal(processingFee(fees), calculateProcessingFee(times));
});

test('batchFactorFor：分档与库 calculateCompositeFactor 的内置规则一致', () => {
  // 其余系数取中性 1.0 时，compositeFactor 就等于 K4
  for (const batch of [1, 2, 50, 51, 500, 501, 10000, 10001]) {
    assert.equal(
      batchFactorFor(batch),
      calculateCompositeFactor('simple', 'general', 'general', batch),
      `批量 ${batch} 的 K4 应与库一致`,
    );
  }
});

test('compositeFactor：与库 calculateCompositeFactor 一致（库默认系数）', () => {
  assert.equal(
    compositeFactor(
      COMPLEXITY_FACTOR.complex,
      PRECISION_FACTOR.high,
      SURFACE_FACTOR.fine,
      batchFactorFor(100),
    ),
    calculateCompositeFactor('complex', 'high', 'fine', 100),
  );
});

test('computeQuote：默认系数下与库 calculateComprehensiveQuote 逐分一致', () => {
  const params = {
    processingFee: 500,
    materialFee: 200,
    complexity: 'complex',
    precision: 'high',
    surface: 'fine',
    batchSize: 100,
    profitMargin: 0.2,
    taxRate: 0.13,
  };
  const lib = calculateComprehensiveQuote(params);
  const ours = computeQuote({
    processingFee: params.processingFee,
    materialFee: params.materialFee,
    k1: COMPLEXITY_FACTOR[params.complexity],
    k2: PRECISION_FACTOR[params.precision],
    k3: SURFACE_FACTOR[params.surface],
    k4: batchFactorFor(params.batchSize),
    batch: params.batchSize,
    profitMargin: params.profitMargin,
    taxRate: params.taxRate,
  });

  assert.equal(ours.subTotal, lib.subTotal);
  assert.equal(ours.compositeFactor, lib.compositeFactor);
  assert.equal(ours.adjustedFee, lib.adjustedFee);
  assert.equal(ours.finalQuote, lib.finalQuote);
  // 综合乘数先舍入到 3 位：1.5×1.35×1.25×1.2 = 3.0375 → 3.038
  // 小计 700 × 3.038 = 2126.60；× 1.2 × 1.13 = 2883.67
  assert.equal(ours.compositeFactor, 3.038);
  assert.equal(ours.finalQuote, 2883.67);
});

test('computeQuote：批量非法值被夹到 1，单件价不会出现负数/除零', () => {
  const r = computeQuote({ processingFee: 100, materialFee: 0, k1: 1, k2: 1, k3: 1, k4: 1, batch: -5, profitMargin: 0, taxRate: 0 });
  assert.equal(r.batch, 1);
  assert.equal(r.finalQuote, 100);
  assert.equal(r.unitPrice, 100);
});

test('computeQuote：利率与税率换算正确', () => {
  const r = computeQuote({ processingFee: 1000, materialFee: 0, k1: 1, k2: 1, k3: 1, k4: 1, batch: 1, profitMargin: 0.2, taxRate: 0.13 });
  // 1000 × 1.2 × 1.13 = 1356
  assert.equal(r.finalQuote, 1356);
});
