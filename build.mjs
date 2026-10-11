/**
 * 构建脚本：把 src/app.js + 公式库依赖打包成单文件 HTML。
 * 用法：node build.mjs
 * 产物：dist/index.html（双击即可在浏览器打开，无需服务器）
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// 用 fileURLToPath 解析路径，避免 Windows 盘符 / 含空格或中文路径出错（pathname 会被百分号编码）
const root = path.dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [path.join(root, 'src', 'app.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  charset: 'utf8',
  legalComments: 'none',
});

const js = result.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const css = readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
const template = readFileSync(path.join(root, 'index.template.html'), 'utf8');

const html = template
  .replace('/*__CSS__*/', () => css)
  .replace('//__JS__', () => js);

mkdirSync(path.join(root, 'dist'), { recursive: true });
writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log('✅ 构建完成：dist/index.html（' + (html.length / 1024).toFixed(1) + ' KB）');
