/**
 * 综合报价计算器 Schema 定义
 *
 * 对应文件10《加工件費用計算表》— 台湾风格综合报价+乘数体系
 *
 * 报价公式：
 *   综合报价 = (加工费 + 材料费) × K1 × K2 × K3 × K4 × (1 + 利润率 + 税率)
 *
 * @module schema/comprehensive-quote
 */
import type { CalculatorDefinition } from './calculator-schema.js';
/**
 * 综合报价计算器完整定义
 *
 * 输入参数：
 * - 加工费/材料费（数值）
 * - 复杂程度/精度等级/表面粗糙度（枚举选择）
 * - 批量（数值）
 * - 利润率/税率（可选）
 *
 * 输出结果：
 * - 加工费/材料费/小计
 * - 综合乘数
 * - 调整后的费用
 * - 最终报价
 */
export declare const comprehensiveQuoteSchema: CalculatorDefinition;
//# sourceMappingURL=comprehensive-quote.d.ts.map