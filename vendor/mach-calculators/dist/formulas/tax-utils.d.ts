/**
 * 报价税率工具。
 *
 * 13% 只是当前中国大陆一般纳税人制造业增值税常见默认参考值，
 * 实际报价应允许企业按票种、客户、时期和地区自行传入税率。
 */
/** 当前默认参考增值税率（13%）。 */
export declare const DEFAULT_VAT_RATE = 0.13;
/**
 * 归一化税率输入。
 * - 0.13 表示 13%
 * - 13 也允许表示 13%，用于兼容表单百分比输入
 */
export declare function normalizeTaxRate(taxRate: number | undefined, defaultRate?: number): number;
/** 计算含税金额。 */
export declare function applyTax(amount: number, taxRate?: number): number;
/** 对已含利润金额计算税额。 */
export declare function calculateTax(amountBeforeTax: number, taxRate?: number): number;
//# sourceMappingURL=tax-utils.d.ts.map