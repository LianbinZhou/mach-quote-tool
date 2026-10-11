# 修复报告：mach-quote-tool 代码审查与修复

> 本报告记录对 `mach-quote-tool` 的一次代码审查、修复过程、验证证据、决策取舍，以及留给复审的开放问题。
> 生成时间：2026-10-11　｜　基线版本：git `74290b4`　｜　环境：Windows + Git Bash，Node v24.21.0
>
> **后续变更说明**：本报告之后，公式库已从本地 `vendor/` 副本改为 **npm 正式依赖**（`@usethink/mach-calculators`），
> `vendor/` 与 `dist/` 均已移出版本库。因此报告中凡是提到 `vendor/...` 路径的内容，反映的是**审查当时的基线状态**，
> 当前实现请以 `package.json` 与 `src/calc.js` 为准。

---

## 0. 摘要

对项目做了完整通读（`README` / `build.mjs` / `index.template.html` / `src/app.js` / `src/style.css` / `vendor/` 公式库），共发现 **4 个 P0 问题、5 个 P1 问题、4 个 P2 工程问题**。

本次修复了其中 **9 项**（P0 全部 + P1 全部 + 1 项 P2），新增了 **纯计算模块、单元测试、浏览器级冒烟测试**，并验证通过：

- `npm test` → **10/10 通过**（断言与公式库逐分一致）
- `npm run test:dom` → **7/7 通过**（真实加载构建产物模拟交互）

最重要的一个发现：**卡片折叠功能在构建产物里是坏的**（静态看不出来，运行时才崩），并已修复且用运行时测试证明。

**未做 `git commit`**，所有改动停留在工作区，便于复审对比。

---

## 1. 基线与环境

```bash
git rev-parse --short HEAD      # 74290b4（修复前）
node -v                         # v24.21.0
```

修复前的构建产物已备份为 `dist/index.html`（35,566 字节）。

---

## 2. 修复清单概览

| # | 优先级 | 问题 | 状态 | 主要文件 |
|---|---|---|---|---|
| F1 | 🔴 P0 | 卡片折叠在内联 onclick + IIFE/mangle 下失效 | ✅ 已修 | `index.template.html` `src/app.js` |
| F2 | 🔴 P0 | 用户输入直接拼 innerHTML，可注入/破坏属性 | ✅ 已修 | `src/app.js` |
| F3 | 🔴 P0 | `dist` 被 gitignore，与「双击即用」矛盾 | ✅ 已修 | `.gitignore` `README.md` |
| F4 | 🔴 P0 | 未使用 vendor 库计算函数（重复实现公式） | ✅ 已修 | `src/calc.js`（新增） |
| F5 | 🟡 P1 | 「恢复自动计算」不重算，直接把费用清零 | ✅ 已修 | `src/app.js` |
| F6 | 🟡 P1 | 切换材料类型后手改高亮残留 | ✅ 已修 | `src/app.js` |
| F7 | 🟡 P1 | K 系数覆盖策略不一致 | ✅ 已修（行为变更，见 §4） | `src/app.js` `index.template.html` |
| F8 | 🟡 P1 | 输入健壮性（批量负数/非法值） | ✅ 已修 | `src/calc.js` |
| F9 | 🟡 P1 | 打印前未生成报价单会空白 | ✅ 已修 | `src/app.js` |
| F10 | 🟢 P2 | `build.mjs` Windows 路径处理脆弱 | ✅ 已修 | `build.mjs` |
| P2-a | 🟢 P2 | 无测试 | ✅ 已加 | `test/` `scripts/` |

---

## 3. 逐项详情

### F1 🔴 卡片折叠功能在构建产物中失效（最重要）

**现象**
双击 `dist/index.html` 后，点击任意卡片标题（1️⃣/2️⃣/3️⃣…）**不会折叠/展开**，浏览器控制台报 `ReferenceError: toggleCard is not defined`。由于卡片默认展开，作者很可能未察觉。

**根因**（跨模块的隐式交互，静态阅读看不出来）
1. `index.template.html` 使用内联事件：`<h2 onclick="toggleCard('card-processing')">`。
2. 内联 `onclick` 在**全局作用域**里查找 `toggleCard`。
3. 但 `build.mjs` 用 esbuild `format: 'iife'` + `minify: true`，把顶层函数**包进闭包并改名**，且从未挂到 `window`。

**证据**
```
修复前 dist：grep 'onclick="toggleCard'  → 5 处
修复前 dist：grep 'window.toggleCard'    → 0 处
```
并用 esbuild 实测确认改名行为：
```
$ node -e "import('esbuild').then(({transform})=>transform('function toggleCard(id){...} toggleCard(\"x\")',{format:'iife',minify:true}).then(r=>console.log(r.code)))"
(()=>{function t(e){...}t("x");})();   // toggleCard → t，且不在全局
```

**修复**
- 模板去掉内联 `onclick`，改为 `class="card-toggle" data-target="card-processing"`，并加 `role="button" tabindex="0"`（顺带支持键盘）。
- `src/app.js` 新增 `bindCardToggles()`，用 `addEventListener` 绑定点击与 Enter/Space。

**验证**
`npm run test:dom` 中：
```
✔ 卡片折叠：点击 .card-toggle 切换 collapsed 类
✔ 折叠：键盘 Enter 也能切换
```
修复后 dist：`onclick="toggleCard"` 出现 **0** 次，`card-toggle` 出现 **6** 次。

---

### F2 🔴 用户输入注入 innerHTML

**现象**
材料牌号、自定义工序名会经模板字符串直接拼进 `innerHTML` 和 `value="..."`。名字含 `"` 会破坏属性；含 `<img onerror=...>` 会在本地执行脚本（自伤型 XSS）。

**修复**
`src/app.js` 新增 `esc()`，对所有用户可控字符串（`material-grade`、自定义工序 `name`、报价单里的数值文本等）统一转义后再拼接：
```js
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
```

**验证**（jsdom 冒烟测试）
```
✔ HTML 转义：材料牌号含特殊字符不会注入元素
✔ HTML 转义：自定义工序名含引号/尖括号安全
```
输入 `<img src=x onerror=alert(1)>"` 与 `"><script>bad()</script>` 后，生成的报价单里 `querySelectorAll('img')`、`querySelectorAll('script')` 均为 0，且原文以文本形式显示。

> 备注：本地单文件工具的自伤风险有限，但属性破坏是实打实的 bug，故一并修。

---

### F3 🔴 `dist` 被忽略与「双击即用」矛盾

**现象**
README 承诺普通用户「直接双击 `dist/index.html`」，但 `.gitignore` 含 `/dist/`，仓库里根本没有产物（`git ls-files dist/` 为空）。别人 clone 后必须装 Node、`npm install`、`npm run build`。

**修复**
- 移除 `.gitignore` 里的 `/dist/` 规则，并注释说明。
- README 更新为：`dist/index.html` 已随仓库提交，普通用户无需构建。
- README 目录结构表同步更新。

**待人工执行**：`git add dist/`（本次未提交，见 §6）。

---

### F4 🔴 重复实现公式库，未调用库函数

**现象**
`app.js` 自行实现了 `calcWeight` / `computeQuote` / `batchFactorFor` / 加工费求和，而 vendor 库已导出 `calculateMaterialWeight`、`calculateMaterialFee`、`calculateComprehensiveQuote`、`calculateProcessingFee`、`calculateCompositeFactor`。重复实现有与库**漂移**的风险，也失去 vendoring 的意义。

**难点（诚实记录）**
库函数**不接受自定义密度/单价**（只认 `material` 键），而本工具的核心卖点之一正是「价格/密度可手改」。因此无法 100% 直接用库函数。

**修复（折中方案）**
新增 `src/calc.js` 纯计算模块：
- **默认路径直接调用库函数**（未手改时零差异）。
- **手改路径用「库基准 + 覆盖」换算**：重量与密度成正比，故 `weight = libWeight × (密度override / 库默认密度)`；费用 `= weight × 手改单价`。
- 计算全部集中于此模块，`app.js` 只负责 DOM。

并写测试**锁死"默认路径必须与库逐分一致"**，将来库更新若导致差异，测试会失败。

**验证**（`npm test`）
```
✔ materialWeight：默认路径与库一致（方料/圆棒/圆管）
✔ materialFee：默认路径与库一致，手改单价按重量×单价
✔ processingFee：默认费率下与库 calculateProcessingFee 一致
✔ batchFactorFor：分档与库 calculateCompositeFactor 的内置规则一致
✔ compositeFactor：与库 calculateCompositeFactor 一致
✔ computeQuote：默认系数下与库 calculateComprehensiveQuote 逐分一致
```

---

### F5 🟡 「恢复自动计算」把费用清零而非重算

**现象** `resetFees()` 把 `[data-fee]` 全部置 `0` 后调用 `updateProcessing()`，但工时仍在，导致点完按钮加工费凭空归零。

**修复** 恢复默认费率后对每行调用 `autoCalcOne(f.key)`，按当前 `工时 × 默认费率` 重算。

**验证**
```
✔ 恢复自动计算：按当前工时×默认费率重算，而不是清零
```
（2h × 35 元/h：手改成 999 后点恢复，回到 70.00）

---

### F6 🟡 材料高亮残留

**现象** 手改价格/密度会加 `manual`（橙色）高亮，但切换材料类型时旧高亮不清除，视觉误导。

**修复** `applyMaterialBase()` 依据是否存在覆盖值，用 `classList.toggle('manual', ...)` 同步高亮。

---

### F7 🟡 K 系数覆盖策略不一致（含**行为变更**，请重点复审）

**现象（修复前）**
- 改「复杂程度/精度/表面」档位时用 `force=true`，**覆盖**手改的 K1/K2/K3。
- 改「批量」时却**保留**手改的 K4。
两者行为不一致，用户无法预期。

**修复（选择了「手改值优先」）**
- 所有档位变化改为**非 force**：仅当该 K 未被手改时才带出库基准；手改值始终优先。
- 新增「↩️ 恢复默认系数」按钮（`btn-reset-k`），一键清除所有 K 手改并回到当前档位基准。
- 此行为与「材料价格/密度」的手改语义保持一致。

**验证**
```
✔ 综合报价与手改系数联动
```
（手改 K1=2 后切换复杂程度，K1 仍为 2；点「恢复默认系数」后随档位回到基准。）

> ⚠️ 这是**对原设计的语义变更**。若作者更希望"换档位即强制采用新基准"，只需把 `syncKDefaults` 的调用加回 `{ force: true }`，但需接受"覆盖手改"的行为。

---

### F8 🟡 输入健壮性

**修复** `calc.js` 的 `computeQuote` 对批量做 `Math.max(1, Math.floor(...))`，非法/负数/零一律夹到 1，避免负单价与除零；`round()` 对 `NaN`/`null`/字符串一律按 0 处理。

**验证**
```
✔ computeQuote：批量非法值被夹到 1，单件价不会出现负数/除零
```

---

### F9 🟡 打印前未生成报价单

**修复** 打印按钮先检查 `#quote-sheet` 是否为空，为空则先 `buildQuoteSheet()`，避免打印空白页。

**验证**
```
✔ 打印前自动生成报价单（不产生空白页）
```

---

### F10 🟢 `build.mjs` 路径处理

**现象** `new URL(import.meta.url).pathname.replace(...)` 在路径含空格/中文时会被百分号编码而失效（当前路径恰好没空格，属潜在坑）。

**修复** 改用 `fileURLToPath(import.meta.url)`：
```js
import { fileURLToPath } from 'url';
const root = path.dirname(fileURLToPath(import.meta.url));
```

---

## 4. 新增的测试与工程设施

| 文件 | 作用 |
|---|---|
| `src/calc.js` | 纯计算模块，默认路径调用库；与 DOM 解耦 |
| `test/calc.test.mjs` | `node:test` 单测，10 例，**对照库断言逐分一致** |
| `scripts/smoke-test.mjs` | jsdom 冒烟测试，7 例，真实加载 `dist/index.html` 模拟交互 |
| `package.json` | 新增 `test` / `test:dom` 脚本；`jsdom` 入 devDependencies |

运行：
```bash
npm test        # 10/10
npm run test:dom  # 构建 + 7/7
```

**测试过程的一个诚实记录**：`computeQuote` 对照库的用例最初失败，是我手算的期望值写错了（忘记库会把综合乘数先舍入到 3 位：`1.5×1.35×1.25×1.2 = 3.0375 → 3.038`），库与本实现的数值其实是一致的。已修正测试注释与字面值。这说明对照断言比手算更可靠。

---

## 5. 未修复 / 留给复审的开放项

这些在审查中被识别，但**本次有意未动**（超出"修 bug"范围，属设计/功能增强）：

1. **报价单内容偏薄**：缺公司抬头、客户、联系人、有效期、签字栏；单号已从纯时间戳改为 `QYYYYMMDD-HHMM` 可读格式，但仍无业务字段。
2. **无数据持久化**：刷新即丢。建议 `localStorage` 自动保存 + 报价 JSON 导入/导出。
3. **库的更多能力未用**：线割/EDM 按面积/孔数/板厚的精细计价、铣削工时、车削公式、模具摊销、表面处理等（`vendor` 中有完整实现）。
4. **`app.js` 仍偏长**（约 380 行，状态+渲染+事件混合），可进一步拆分。
5. **可访问性仅做了键盘折叠**，输入错误提示、ARIA 描述等仍缺。
6. **`#quote-sheet` 若处于 `collapsed` 且直接打印**：`@media print` 未强制显示 `.card-body`，理论上仍可能空白（已通过"生成时移除 collapsed"缓解，但需在真实浏览器验证打印预览）。

---

## 6. 如何复现验证 / 复审指引

```bash
cd mach-quote-tool
npm install
npm test                 # 期望 10/10
npm run test:dom         # 期望 7/7
npm run build            # 产物 dist/index.html
git diff                 # 查看全部改动
git status               # 注意 dist/ scripts/ src/calc.js test/ 为新增未跟踪
```

**建议复审重点**（供下一个审查模型参考）：
- `src/calc.js` 中「库基准 + 覆盖」的换算是否在所有边界（密度为 0、材料键未知、重量为 0）下正确。
- F7 的**行为变更**是否符合作者本意。
- `esc()` 是否覆盖了所有用户可控入口（目前覆盖材料牌号、自定义工序名、报价单文本；请检查有无遗漏）。
- jsdom 冒烟测试与真实浏览器行为的差距（jsdom 不覆盖布局/打印/CSS）。
- `dist/index.html` 是否应提交进版本库（涉及仓库体积与 CI 习惯，需作者拍板）。

---

## 7. 改动文件清单

```
 M .gitignore            移除 /dist/ 忽略
 M README.md             发布方式、目录结构、测试说明
 M build.mjs             改用 fileURLToPath
 M index.template.html   去内联 onclick；加「恢复默认系数」按钮
 M package.json          新增 test / test:dom 脚本与 jsdom
 M package-lock.json     npm install 同步
 M src/app.js            事件绑定、HTML 转义、重置/高亮修复、接入 calc.js
?? src/calc.js           新增：纯计算模块
?? test/calc.test.mjs    新增：单测
?? scripts/smoke-test.mjs 新增：jsdom 冒烟测试
?? dist/                 构建产物（现可被跟踪，待 git add）
```

**未提交任何 commit。**
