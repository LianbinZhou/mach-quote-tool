/**
 * 浏览器级冒烟测试（用 jsdom 真实加载构建产物 dist/index.html）。
 *
 * 用途：验证「静态看不见、一跑才崩」的问题，例如：
 *  - 卡片折叠是否可用（此前因内联 onclick 指向被 esbuild 改名/闭包化的函数而失效）
 *  - 用户输入里的特殊字符是否被转义（防注入 / 防破坏属性）
 *  - 恢复默认按钮是否按当前工时重算
 *
 * 依赖：npm i -D jsdom
 * 运行：npm run test:dom   （需先 npm run build）
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// 等 DOMContentLoaded 后的初始化执行完
await new Promise((r) => {
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(r, 0);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0));
});

const results = [];
function check(name, fn) {
  try { fn(); results.push(['✔', name]); }
  catch (e) { results.push(['✖', name + ' → ' + e.message]); }
}

check('卡片折叠：点击 .card-toggle 切换 collapsed 类', () => {
  const card = document.getElementById('card-processing');
  const head = card.querySelector('.card-toggle');
  assert.ok(head, '找不到 .card-toggle');
  assert.equal(card.classList.contains('collapsed'), false);
  head.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.classList.contains('collapsed'), true, '点击后未折叠');
  head.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.classList.contains('collapsed'), false, '再次点击未展开');
});

check('折叠：键盘 Enter 也能切换', () => {
  const card = document.getElementById('card-material');
  const head = card.querySelector('.card-toggle');
  head.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(card.classList.contains('collapsed'), true);
});

check('HTML 转义：材料牌号含特殊字符不会注入元素', () => {
  document.getElementById('material-grade').value = '<img src=x onerror=alert(1)>"';
  document.getElementById('btn-generate').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const sheet = document.getElementById('quote-sheet');
  assert.equal(sheet.querySelectorAll('img').length, 0, '注入出了 <img> 元素');
  assert.ok(sheet.textContent.includes('<img src=x'), '文本未按原文显示');
});

check('HTML 转义：自定义工序名含引号/尖括号安全', () => {
  document.getElementById('btn-add-process').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const nameInput = document.querySelector('#custom-process-inputs [data-name]');
  nameInput.value = '"><script>bad()</script>';
  nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  const feeInput = document.querySelector('#custom-process-inputs [data-fee]');
  feeInput.value = '123';
  feeInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  document.getElementById('btn-generate').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const sheet = document.getElementById('quote-sheet');
  assert.equal(sheet.querySelectorAll('script').length, 0, '注入出了 <script>');
  assert.ok(sheet.textContent.includes('<script>bad()</script>'), '自定义工序名未按原文显示');
});

check('恢复自动计算：按当前工时×默认费率重算，而不是清零', () => {
  const hours = document.querySelector('[data-hours="cncTurning"]');
  hours.value = '2';
  hours.dispatchEvent(new window.Event('input', { bubbles: true }));
  const fee = document.querySelector('[data-fee="cncTurning"]');
  assert.equal(fee.value, '70.00', '工时×费率应自动算出 70');
  // 手改后应锁定
  fee.value = '999';
  fee.dispatchEvent(new window.Event('input', { bubbles: true }));
  document.getElementById('btn-reset-fees').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(fee.value, '70.00', '恢复后应按 2h × 35 重算为 70，而不是 0');
});

check('打印前自动生成报价单（不产生空白页）', () => {
  // 清空报价单后调用打印逻辑
  document.getElementById('quote-sheet').innerHTML = '';
  window.print = () => {}; // jsdom 未实现 print，桩掉
  document.getElementById('btn-print').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(document.getElementById('quote-sheet').innerHTML.trim().length > 0, '打印前未生成报价单');
});

check('综合报价与手改系数联动', () => {
  const k1 = document.getElementById('q-k1');
  k1.value = '2';
  k1.dispatchEvent(new window.Event('input', { bubbles: true }));
  // 手改后切换档位不应被覆盖
  const sel = document.getElementById('q-complexity');
  sel.value = 'simple';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(k1.value, '2', '手改的 K1 被档位切换覆盖了');
  // 恢复默认系数应清除手改
  document.getElementById('btn-reset-k').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(k1.value, '1', '恢复默认系数后 K1 应为 simple=1');
});

let failed = 0;
for (const [mark, name] of results) {
  if (mark === '✖') failed++;
  console.log(`${mark} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} 通过`);
if (failed) process.exit(1);
