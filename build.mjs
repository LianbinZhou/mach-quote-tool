/**
 * 构建脚本：把 src/app.js + vendor 公式库打包成单文件 HTML。
 * 用法：node build.mjs
 * 产物：dist/index.html（双击即可在浏览器打开，无需服务器）
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));

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
