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
export declare function comprehensiveQuoteAdapter(params: ComprehensiveQuoteAdapterInput): CalculationResult;
//# sourceMappingURL=comprehensive-quote-adapter.d.ts.map