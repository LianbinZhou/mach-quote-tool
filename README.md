# Mach Quote Tool（机加工报价计算器）

给机加工行业（CNC 车/铣、线割、放电、磨床等）用的**快速报价网页工具**——把 `@usethink/mach-calculators` 公式库封装成单文件网页，**双击就能用**。

本项目自身代码为 MIT 协议；依赖的第三方公式库版权归原作者（**授权状况请注意阅读文末说明**）。

## 怎么开始用

### 方式一：直接下载成品（普通用户推荐）

前往 **[Releases 页面](https://github.com/LianbinZhou/mach-quote-tool/releases/latest)**，下载该版本 **Assets** 里的 `.html` 附件（文件名形如 `mach-quote-tool-v0.x.x.html`），然后**双击用浏览器打开**即可。

不需要安装 Node.js、不需要联网、不需要服务器——整个工具就是这一个文件。

> 💡 下载后建议把文件名改成「机加工报价计算器.html」，更方便识别和转发。

### 方式二：从源码自己构建

```bash
git clone https://github.com/LianbinZhou/mach-quote-tool.git
cd mach-quote-tool
npm install      # 安装依赖（含公式库与构建工具）
npm run build    # 生成 dist/index.html
```

产物 `dist/index.html` 双击即可使用。

> 需要先装好 [Node.js](https://nodejs.org/)（v18 以上）。构建只需做一次，日常使用不依赖 Node。

## 这是什么

面向机加工报价的乘数体系计算器，功能包括：

1. **加工费计算**：各工序工时 × 设备费率，支持「➕ 添加一行」自定义工序（外包、热处理等），所有费用可手动改
2. **材料费计算**：毛坯（方料/圆棒/圆管）体积 × 密度 × 单价；材料类型带出基准价，但**单价、密度、牌号均可手改**（如 7075 / 6063 / 45# / 304）
3. **综合报价**：(加工费 + 材料费) × K1 × K2 × K3 × K4 × (1 + 利润率) × (1 + 税率)；复杂程度、精度、表面、批量系数**默认带出基准值，也可手改**
4. **明细报价单**：一键生成含工序/材料/系数全程明细的报价单，支持打印或存为 PDF

> 设计原则：公式库提供的价格与系数只作为**基准参考**，任何一项都允许按实际行情覆盖。被手动修改的输入框会高亮提示。
>
> ⚠️ **本工具不保存数据**：刷新或关闭页面后填写的内容会清空，算完请先「打印 / 存为 PDF」存档。

## 命令速查

```bash
npm install          # 安装依赖（首次必做）
npm run build        # 构建，产出 dist/index.html ← 双击这个文件使用
npm test             # 单元测试（10 例，断言与公式库计算结果逐分一致）
npm run test:dom     # 浏览器级冒烟测试（7 例，用 jsdom 真实模拟交互）
```

## 目录结构

| 路径 | 说明 |
|---|---|
| `src/app.js` | 应用逻辑（状态、渲染、事件绑定，界面与公式库的粘合层） |
| `src/calc.js` | 纯计算模块（与 DOM 解耦，默认路径直接调用公式库，便于测试） |
| `src/style.css` | 样式 |
| `index.template.html` | HTML 模板（构建时注入 JS/CSS） |
| `build.mjs` | 构建脚本：esbuild 打包 + 内联成单文件 HTML |
| `test/calc.test.mjs` | 单元测试（对照公式库，防止计算结果漂移） |
| `scripts/smoke-test.mjs` | jsdom 浏览器级冒烟测试（折叠/转义/重置等交互） |
| `dist/` | 构建产物目录（运行 `npm run build` 后生成，不入版本库） |

## 公式来源

报价公式源自台湾风格《加工件费用计算表》的乘数体系：

```
综合报价 = (加工费 + 材料费) × K1 × K2 × K3 × K4 × (1 + 利润率) × (1 + 税率)
K1 = 复杂程度系数（1.0 ~ 2.0）
K2 = 精度等级系数（1.0 ~ 1.6）
K3 = 表面粗糙度系数（1.0 ~ 1.8）
K4 = 批量系数（0.85 ~ 2.0）
```

## 依赖与 License

- **本项目自身代码**：MIT（见 [LICENSE](LICENSE)）
- **第三方依赖**：
  - [`@usethink/mach-calculators`](https://www.npmjs.com/package/@usethink/mach-calculators)（加工报价公式库，版权归原作者）
  - `esbuild`、`jsdom`（构建与测试工具）

### ⚠️ 关于公式库的授权状况（请留意）

本项目依赖的 `@usethink/mach-calculators` **没有声明任何开源协议**（npm 上的 license 字段为空）。按著作权惯例，这通常意味着**作者保留所有权利**。

本项目对此的实际情况，如实说明如下：

- 本仓库**不包含**该库的源码副本——`vendor/` 与 `dist/` 都已移出版本控制，构建时通过 `npm install` 从 npm 官方渠道获取；
- 但 **Releases 中提供的 `dist/index.html` 里包含该库编译后的代码**（打包产物）。公开发布这个文件，严格来说**同样构成对该库的再分发**；
- 也就是说：**这个问题并未完全解决**，只是把分发位置从 git 仓库换到了 Releases。

**给使用者的建议**：

- 个人、学习、内部试用等场景，正常使用即可；
- 若要用于正式项目或商业场合，建议先与库作者确认授权，或改为**自行构建、不依赖本项目的成品文件**；
- 若库作者后续补充了授权协议，此限制即可解除。

**给库作者**：如果你看到这里，希望能为 `@usethink/mach-calculators` 补一个 LICENSE —— 这个小工具的存在完全归功于你的公式库。

---

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
