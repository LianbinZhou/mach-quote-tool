/**
 * 数控报价计算器渲染引擎
 *
 * 根据 CalculatorDefinition schema 动态渲染输入表单和计算结果。
 * 纯 vanilla JS 实现，无框架依赖。
 *
 * 工作流程：
 * 1. 从 schema 定义中读取输入字段配置
 * 2. 动态创建表单元素
 * 3. 监听输入变更，调用公式函数
 * 4. 根据输出定义渲染结果
 *
 * @module renderer/calculator-renderer
 */
/**
 * 输入字段渲染器
 * 根据 InputField 配置创建对应的 DOM 元素
 */
export class InputRenderer {
    /**
     * 渲染单个输入字段
     * @param {InputField} field - 输入字段定义
     * @returns {HTMLElement} - 字段容器元素
     */
    static render(field: InputField): HTMLElement;
    /**
     * 收集所有输入字段的值
     * @param {CalculatorDefinition} schema - 计算器定义
     * @param {HTMLElement} container - 表单容器
     * @returns {Object} - 输入参数对象
     */
    static collectValues(schema: CalculatorDefinition, container: HTMLElement): Object;
}
/**
 * 输出字段渲染器
 * 根据 OutputField 配置创建结果展示元素
 */
export class OutputRenderer {
    /**
     * 渲染单个输出字段
     * @param {OutputField} field - 输出字段定义
     * @param {*} value - 计算结果值
     * @returns {HTMLElement} - 结果展示元素
     */
    static render(field: OutputField, value: any): HTMLElement;
    /**
     * 渲染所有输出结果
     * @param {OutputField[]} outputs - 输出字段定义
     * @param {Object} data - 计算结果数据
     * @returns {DocumentFragment} - 结果片段
     */
    static renderAll(outputs: OutputField[], data: Object): DocumentFragment;
}
/**
 * 计算器渲染器
 * 核心类，负责整个计算器的渲染和交互
 */
export class CalculatorRenderer {
    /**
     * 创建计算器渲染器
     * @param {CalculatorDefinition} schema - 计算器定义
     * @param {Function} calculateFunc - 计算公式函数
     */
    constructor(schema: CalculatorDefinition, calculateFunc: Function);
    schema: CalculatorDefinition;
    calculateFunc: Function;
    container: HTMLElement | null;
    inputsContainer: HTMLDivElement | null;
    resultsContainer: HTMLDivElement | null;
    isAutoCalculate: boolean;
    /**
     * 渲染计算器到指定容器
     * @param {HTMLElement} container - 目标容器
     */
    render(container: HTMLElement): void;
    /**
     * 绑定输入事件
     */
    bindEvents(): void;
    /**
     * 执行计算
     */
    calculate(): void;
    /**
     * 渲染计算结果
     * @param {Object} data - 计算结果数据
     */
    renderResults(data: Object): void;
    /**
     * 显示错误信息
     * @param {string} message - 错误信息
     */
    showError(message: string): void;
    /**
     * 手动触发计算
     */
    triggerCalculate(): void;
    /**
     * 重置表单
     */
    reset(): void;
}
//# sourceMappingURL=calculator-renderer.d.ts.map