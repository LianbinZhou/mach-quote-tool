/**
 * 数控报价计算器 Schema 类型定义
 *
 * 定义计算器的输入/输出/计算配置，用于动态渲染表单和调用公式。
 *
 * @module schema/calculator-schema
 */
/**
 * 验证计算器schema是否有效
 */
export function validateCalculatorSchema(schema) {
    const errors = [];
    // 基本必填验证
    if (!schema.id) {
        errors.push('缺少必填字段: id');
    }
    if (!schema.title) {
        errors.push('缺少必填字段: title');
    }
    if (!schema.description) {
        errors.push('缺少必填字段: description');
    }
    if (!schema.formula?.module) {
        errors.push('缺少必填字段: formula.module');
    }
    if (!schema.formula?.function) {
        errors.push('缺少必填字段: formula.function');
    }
    if (!schema.inputs || schema.inputs.length === 0) {
        errors.push('至少需要定义一个输入字段: inputs');
    }
    if (!schema.outputs || schema.outputs.length === 0) {
        errors.push('至少需要定义一个输出字段: outputs');
    }
    // 输入字段验证
    if (schema.inputs) {
        const keys = new Set();
        for (const input of schema.inputs) {
            if (!input.key) {
                errors.push(`输入字段缺少key: ${JSON.stringify(input)}`);
            }
            else if (keys.has(input.key)) {
                errors.push(`输入字段key重复: ${input.key}`);
            }
            keys.add(input.key);
            // select/radio必须有options
            if ((input.type === 'select' || input.type === 'radio') && !input.options?.length) {
                errors.push(`输入字段${input.key}是${input.type}类型，但缺少options`);
            }
            // number类型验证min/max
            if (input.type === 'number') {
                if (input.min !== undefined && input.max !== undefined && input.min > input.max) {
                    errors.push(`输入字段${input.key}的min(${input.min}) > max(${input.max})`);
                }
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
//# sourceMappingURL=calculator-schema.js.map