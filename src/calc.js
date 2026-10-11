/**
 * 纯计算模块 —— 与 DOM / UI 解耦，便于单元测试。
 *
 * 设计原则：
 * 1. **默认路径直接调用 vendor 公式库** `@usethink/mach-calculators`，
 *    保证与公式库同源；将来公式库更新，本工具自动跟随，不会算出差值。
 * 2. 用户手改单价 / 密度 / K 系数时，用「库基准 + 覆盖」的方式计算。
 *    原因：公式库的 `calculateMaterialWeight` / `calculateMaterialFee` 只接受
 *    `material` 键，不接受自定义密度 / 单价，所以覆盖值无法直接透传，
 *    只能在库结果上按比例换算（重量与密度成正比，费用 = 重量 × 单价）。
 * 3. 精度约定：金额 2 位、重量 3 位、系数 3 位（与公式库保持一致）。
 */
import {
  calculateMaterialWeight,
  calculateMaterialFee,
  MATERIAL_DENSITY,
  BATCH_FACTOR,
} from '../vendor/mach-calculators/dist/index.js';

/** 四舍五入到指定小数位；非法输入按 0 处理。 */
export function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round((Number(n) || 0) * f) / f;
}

/**
 * 批量 → K4 系数。
 * 分档规则与库内 `calculateCompositeFactor` 完全一致（单件/小/中/大/大量）。
 * @param {number} n 批量件数
 */
export function batchFactorFor(n) {
  const batch = Math.max(1, Math.floor(Number(n) || 0));
  if (batch <= 1) return BATCH_FACTOR.single;
  if (batch <= 50) return BATCH_FACTOR.small;
  if (batch <= 500) return BATCH_FACTOR.medium;
  if (batch <= 10000) return BATCH_FACTOR.large;
  return BATCH_FACTOR.mass;
}

/**
 * 毛坯重量（kg）。
 * - 未手改密度：直接返回库结果。
 * - 手改密度：重量与密度成正比，在库结果上按 `override / base` 换算。
 * @param {string} shape    square | round | tube
 * @param {object} dims     尺寸（mm）
 * @param {string} material 材料键（如 aluminum）
 * @param {number|null} densityOverride 手改密度（g/cm³），未手改传 null
 */
export function materialWeight(shape, dims, material, densityOverride = null) {
  const base = calculateMaterialWeight(shape, { ...dims, material });
  const baseDensity = MATERIAL_DENSITY[material];
  if (densityOverride == null || !baseDensity || Number(densityOverride) === baseDensity) {
    return base;
  }
  return round(base * (Number(densityOverride) / baseDensity), 3);
}

/**
 * 材料费（元）。
 * - 未手改单价：直接返回库结果。
 * - 手改单价：重量 × 手改单价。
 * @param {number} weight 重量（kg）
 * @param {string} material 材料键
 * @param {number|null} priceOverride 手改单价（元/kg），未手改传 null
 */
export function materialFee(weight, material, priceOverride = null) {
  if (priceOverride == null) return calculateMaterialFee(weight, material);
  return round(weight * Number(priceOverride), 2);
}

/** 加工费小计：把各行费用（数字或数字字符串）求和。 */
export function processingFee(fees) {
  return round(
    fees.reduce((sum, v) => sum + (Number(v) || 0), 0),
    2,
  );
}

/** 综合乘数 K1×K2×K3×K4（使用界面上实际显示的值，可能是手改值）。 */
export function compositeFactor(k1, k2, k3, k4) {
  return round(
    (Number(k1) || 1) * (Number(k2) || 1) * (Number(k3) || 1) * (Number(k4) || 1),
    3,
  );
}

/**
 * 综合报价。
 *   小计     = 加工费 + 材料费
 *   调整后   = 小计 × K1×K2×K3×K4
 *   最终报价 = 调整后 × (1 + 利润率) × (1 + 税率)
 *
 * 注意：公式库的 `calculateComprehensiveQuote` 会自己按档位重算 K 系数，
 * 无法接受手改后的 K，因此这里用相同公式链自行完成；当 K 系数均取库默认时，
 * 结果与库函数逐分一致（见 test/calc.test.mjs 的对照断言）。
 *
 * @param {object} p
 * @param {number} p.processingFee 加工费（元）
 * @param {number} p.materialFee   材料费（元）
 * @param {number} p.k1 @param {number} p.k2 @param {number} p.k3 @param {number} p.k4 乘数
 * @param {number} p.batch         批量（件，最小 1）
 * @param {number} p.profitMargin  利润率（小数，0.2 = 20%）
 * @param {number} p.taxRate       税率（小数，0.13 = 13%）
 */
export function computeQuote(p) {
  const batch = Math.max(1, Math.floor(Number(p.batch) || 0));
  const subTotal = round((Number(p.processingFee) || 0) + (Number(p.materialFee) || 0), 2);
  const factor = compositeFactor(p.k1, p.k2, p.k3, p.k4);
  const adjustedFee = round(subTotal * factor, 2);
  const profitMargin = Number(p.profitMargin) || 0;
  const taxRate = Number(p.taxRate) || 0;
  const finalQuote = round(adjustedFee * (1 + profitMargin) * (1 + taxRate), 2);

  return {
    subTotal,
    compositeFactor: factor,
    adjustedFee,
    finalQuote,
    batch,
    profitMargin,
    taxRate,
    unitPrice: round(finalQuote / batch, 2),
  };
}
