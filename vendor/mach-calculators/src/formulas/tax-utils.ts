/**
 * 报价税率工具。
 *
 * 13% 只是当前中国大陆一般纳税人制造业增值税常见默认参考值，
 * 实际报价应允许企业按票种、客户、时期和地区自行传入税率。
 */

/** 当前默认参考增值税率（13%）。 */
export const DEFAULT_VAT_RATE = 0.13;

/**
 * 归一化税率输入。
 * - 0.13 表示 13%
 * - 13 也允许表示 13%，用于兼容表单百分比输入
 */
export function normalizeTaxRate(taxRate: number | undefined, defaultRate = DEFAULT_VAT_RATE): number {
  if (taxRate === undefined || Number.isNaN(taxRate)) return defaultRate;
  return taxRate > 1 ? taxRate / 100 : taxRate;
}

/** 计算含税金额。 */
export function applyTax(amount: number, taxRate?: number): number {
  const normalizedTaxRate = normalizeTaxRate(taxRate);
  return Math.round(amount * (1 + normalizedTaxRate) * 100) / 100;
}

/** 对已含利润金额计算税额。 */
export function calculateTax(amountBeforeTax: number, taxRate?: number): number {
  const normalizedTaxRate = normalizeTaxRate(taxRate);
  return Math.round(amountBeforeTax * normalizedTaxRate * 100) / 100;
}
