/**
 * 综合报价公式适配器。
 *
 * 将表单/schema 输入转换为 calculateComprehensiveQuote 的强类型参数，
 * 并统一包装为计算器渲染层可消费的成功/失败结果。
 */
import { calculateComprehensiveQuote } from '../formulas/comprehensive-quote.js';
import { DEFAULT_VAT_RATE } from '../formulas/tax-utils.js';
import type { CalculationResult } from '../schema/calculator-schema.js';

export interface ComprehensiveQuoteAdapterInput {
  processingFee?: number | string;
  materialFee?: number | string;
  complexity?: string;
  precision?: string;
  surface?: string;
  batchSize?: number | string;
  profitMargin?: number | string;
  taxRate?: number | string;
}

/**
 * 综合报价公式适配器。
 */
export function comprehensiveQuoteAdapter(
  params: ComprehensiveQuoteAdapterInput,
): CalculationResult {
  try {
    const profitMarginInput = Number(params.profitMargin);
    const taxRateInput = Number(params.taxRate);
    const formulaParams = {
      processingFee: Number(params.processingFee) || 0,
      materialFee: Number(params.materialFee) || 0,
      complexity: params.complexity || 'medium',
      precision: params.precision || 'general',
      surface: params.surface || 'general',
      batchSize: Number(params.batchSize) || 1,
      profitMargin: Number.isFinite(profitMarginInput) ? profitMarginInput / 100 : 0.20,
      taxRate: Number.isFinite(taxRateInput) ? taxRateInput / 100 : DEFAULT_VAT_RATE,
    };

    return {
      success: true,
      data: calculateComprehensiveQuote(formulaParams) as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '计算失败',
    };
  }
}
