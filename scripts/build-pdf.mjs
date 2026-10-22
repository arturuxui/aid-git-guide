/**
 * build-pdf — выгружаемая копия гайда: все главы content/ru/*.md одним PDF.
 *
 * Тот же текст, что в Presentbook, но схемы mermaid нарисованы, а ответы «Проверь себя»
 * напечатаны раскрытыми. Порядок глав — по имени файла (00…13, шпаргалка, глоссарий),
 * как в реестре Presentbook.
 *
 * Запуск: npm run pdf → dist/git-for-beginners.pdf (и dist/git-for-beginners.html для проверки).
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import puppeteer from 'puppeteer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'content/ru');
const distDir = join(root, 'dist');
const require = createRequire(import.meta.url);
const mermaidScript = join(dirname(require.resolve('mermaid/package.json')), 'dist/mermaid.min.js');

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function splitFrontmatter(raw) {
  if (!raw.startsWith('---')) return { frontmatter: '', body: raw };
  const fmEnd = raw.indexOf('\n---', 3);
  return { frontmatter: raw.slice(4, fmEnd), body: raw.slice(fmEnd + 4) };
}

function field(block, key) {
  const m = block.match(new RegExp(`^\\s*${key}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'));
  return m ? m[1].trim() : null;
}

const slug = (text) =>
  text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

const files = readdirSync(contentDir).filter((f) => f.endsWith('.md')).sort();
const chapters = files.map((file) => {
  const { frontmatter, body } = splitFrontmatter(readFileSync(join(contentDir, file), 'utf8').replace(/\r/g, ''));
  const id = field(frontmatter, 'id') ?? file.replace(/\.md$/, '');
  const title = body.match(/^#\s+(.+)$/m)?.[1].trim() ?? id;
  return { file, id, title, body };
});
const idByFile = new Map(chapters.map((c) => [c.file, c.id]));

/* Ответы «Проверь себя» в печати — раскрыты. Замена до разбора: тогда `код` и **жирный** внутри
   ответа размечает сам marked (span — строчный тег, текст в нём разбирается как markdown). */
function openAnswers(body) {
  return body.replace(
    /<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g,
    (_, summary, answer) => `<span class="answer"><b>${summary.trim()}:</b> ${answer.trim()}</span>`,
  );
}

function chapterMarked(chapterId) {
  const marked = new Marked();
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${chapterId}--${slug(text)}">${text}</h${depth}>\n`;
      },
      code({ text, lang }) {
        if ((lang ?? '').trim() === 'mermaid') return `<figure class="diagram"><pre class="mermaid">${escapeHtml(text)}</pre></figure>\n`;
        return `<pre><code>${escapeHtml(text)}</code></pre>\n`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        const sibling = href.match(/^(?:\.\/)?([\w-]+\.md)(?:#([\w\p{L}-]*))?$/u);
        if (sibling && idByFile.has(sibling[1])) {
          const target = idByFile.get(sibling[1]);
          return `<a href="#${target}${sibling[2] ? `--${sibling[2]}` : ''}">${text}</a>`;
        }
        if (href.startsWith('#')) return `<a href="#${chapterId}--${href.slice(1)}">${text}</a>`;
        return `<a href="${escapeHtml(href)}">${text}</a>`;
      },
    },
  });
  return marked;
}

let commit = 'local';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
} catch {}
const date = new Date().toISOString().slice(0, 10);

const toc = chapters.map((c) => `<li><a href="#${c.id}">${escapeHtml(c.title)}</a></li>`).join('\n');
const sections = chapters
  .map((c) => {
    const html = chapterMarked(c.id).parse(openAnswers(c.body.replace(/^#\s+.+$/m, '')));
    return `<section class="chapter" id="${c.id}"><h1>${escapeHtml(c.title)}</h1>\n${html}</section>`;
  })
  .join('\n');

const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Git for Beginners</title>
<style>
  :root {
    --text: #1f2328;
    --muted: #59636e;
    --line: #d1d9e0;
    --soft: #f6f8fa;
    --accent: #0969da;
  }
  @page { size: A4; margin: 18mm 16mm 20mm; }
  body { font-family: "Segoe UI", "Noto Sans", "DejaVu Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: var(--text); background: #fff; }
  .cover { height: 240mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover h1 { font-size: 34pt; margin: 0 0 6mm; border: 0; }
  .cover p { font-size: 13pt; color: var(--muted); margin: 0 0 3mm; max-width: 140mm; }
  .cover .meta { margin-top: 20mm; font-size: 9pt; }
  .toc { page-break-after: always; }
  .toc ol { padding-left: 6mm; }
  .toc li { margin: 1.5mm 0; }
  .chapter { page-break-before: always; }
  h1 { font-size: 20pt; margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 1px solid var(--line); }
  h2 { font-size: 13.5pt; margin: 7mm 0 2mm; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 5mm 0 2mm; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  a { color: var(--accent); text-decoration: none; }
  code { font-family: Consolas, "DejaVu Sans Mono", monospace; font-size: 9pt; background: var(--soft); padding: 0 1mm; border-radius: 1mm; }
  pre { background: var(--soft); border: 1px solid var(--line); border-radius: 2mm; padding: 3mm; white-space: pre-wrap; page-break-inside: avoid; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 3mm 0; padding: 1mm 4mm; border-left: 1mm solid var(--line); color: var(--text); background: var(--soft); page-break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
  th { background: var(--soft); }
  small { color: var(--muted); }
  .answer { display: block; margin-top: 1mm; color: var(--muted); font-size: 9.5pt; }
  .diagram { margin: 4mm 0; text-align: center; page-break-inside: avoid; }
  .diagram pre.mermaid { background: none; border: 0; padding: 0; }
  .diagram svg { max-width: 100%; height: auto; max-height: 110mm; }
</style>
</head>
<body>
<section class="cover">
  <h1>Git for Beginners</h1>
  <p>Гайд по git для новичков: коммит, ветки, push, Pull Request, merge, CI и работа в команде — с блоками «Как это в AID».</p>
  <p>Выгружаемая копия. Актуальная версия — в Presentbook AID.</p>
  <p class="meta">Собрано ${date} · коммит ${commit}</p>
</section>
<nav class="toc"><h1>Содержание</h1><ol start="0">${toc}</ol></nav>
${sections}
</body>
</html>`;

mkdirSync(distDir, { recursive: true });
const htmlFile = join(distDir, 'git-for-beginners.html');
writeFileSync(htmlFile, page, 'utf8');

const browser = await puppeteer.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
try {
  const tab = await browser.newPage();
  await tab.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
  await tab.addScriptTag({ path: mermaidScript });
  const failed = await tab.evaluate(async () => {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict', fontFamily: 'inherit' });
    await window.mermaid.run({ querySelector: 'pre.mermaid', suppressErrors: true });
    return [...document.querySelectorAll('pre.mermaid')].filter((el) => !el.querySelector('svg')).length;
  });
  if (failed) {
    console.error(`Не нарисовано схем: ${failed}`);
    process.exitCode = 1;
  }
  await tab.pdf({
    path: join(distDir, 'git-for-beginners.pdf'),
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#59636e;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>Git for Beginners</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
  });
} finally {
  await browser.close();
}
console.log(`dist/git-for-beginners.pdf — ${chapters.length} глав, коммит ${commit}`);
