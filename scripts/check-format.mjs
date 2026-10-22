/**
 * check-format — проверяет, что главы content/ru/*.md соберутся в Presentbook без правок.
 *
 * Presentbook собирает гайд своим сборщиком (RickOBrian/aid,
 * pages/aid-portal/scripts/external-guide-markdown.mjs). Проверка берёт его из main
 * при каждом запуске — не копирует: поменяются правила там, упадёт здесь.
 *
 * Ловит:
 *   - схему mermaid, которую сборщик не разобрал (на странице будет исходник);
 *   - HTML вне белого списка или с атрибутами (на странице — экранированный текст);
 *   - ссылку, которая станет текстом (не http(s), не mailto, не якорь, не соседняя глава);
 *   - картинку (на странице останется только подпись);
 *   - логин инженера и ссылку на личный репозиторий (решение PD по #275);
 *   - главу без `id` во frontmatter или без заголовка `# …`.
 *
 * Запуск: npm run check. Адрес сборщика можно подменить: CONVERTER_URL=file:///… npm run check.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'content/ru');
const CONVERTER_URL =
  process.env.CONVERTER_URL ??
  'https://raw.githubusercontent.com/RickOBrian/aid/main/pages/aid-portal/scripts/external-guide-markdown.mjs';

/* Сборщик кладётся внутрь репозитория, чтобы `import 'marked'` в нём нашёл наш node_modules. */
async function loadConverter() {
  let source;
  if (CONVERTER_URL.startsWith('file:')) {
    source = readFileSync(fileURLToPath(CONVERTER_URL), 'utf8');
  } else {
    const response = await fetch(CONVERTER_URL);
    if (!response.ok) {
      console.error(`::error::Сборщик Presentbook недоступен: ${response.status} ${CONVERTER_URL}`);
      console.error('Возможно, его переименовали в RickOBrian/aid — проверь pages/aid-portal/scripts/.');
      process.exit(1);
    }
    source = await response.text();
  }
  const cacheDir = join(root, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, 'external-guide-markdown.mjs');
  writeFileSync(file, source, 'utf8');
  return import(pathToFileURL(file).href);
}

/* Как в build-guides.mjs Presentbook. */
function splitFrontmatter(raw) {
  if (!raw.startsWith('---')) return { frontmatter: '', body: raw, bodyStart: 0 };
  const fmEnd = raw.indexOf('\n---', 3);
  const bodyStart = raw.slice(0, fmEnd + 4).split('\n').length - 1;
  return { frontmatter: raw.slice(4, fmEnd), body: raw.slice(fmEnd + 4), bodyStart };
}

function field(block, key) {
  const m = block.match(new RegExp(`^\\s*${key}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'));
  return m ? m[1].trim() : null;
}

/* Строки тела вне блоков кода, с номером строки в файле и без `инлайн-кода`. */
function proseLines(body, bodyStart) {
  const lines = body.split('\n');
  const out = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      fence = !fence;
      return;
    }
    if (!fence) out.push({ line: bodyStart + i + 1, text: line.replace(/`[^`\n]*`/g, '') });
  });
  return out;
}

const ALLOWED_TAGS = new Set(['details', 'summary', 'small', 'br']);
// `owner/repo` — заглушка в примерах команд.
const PERSONAL = /arturuxui|github\.com\/(?!RickOBrian\/aid\b|owner\/)[\w.-]+\/?/i;

const egm = await loadConverter();
const files = readdirSync(contentDir).filter((f) => f.endsWith('.md')).sort();
const md = egm.createExternalMarked({ resolveChapter: (f) => (files.includes(f) ? `/guides/x/${f}` : null) });

let errors = 0;
function fail(file, line, message) {
  errors++;
  const rel = `content/ru/${file}`;
  console.log(`::error file=${rel}${line ? `,line=${line}` : ''}::${message}`);
}

for (const file of files) {
  const raw = readFileSync(join(contentDir, file), 'utf8').replace(/\r/g, '');
  const { frontmatter, body, bodyStart } = splitFrontmatter(raw);
  const before = errors;

  if (!field(frontmatter, 'id')) fail(file, 1, 'Нет `id` во frontmatter — Presentbook возьмёт имя файла как адрес главы');
  if (!/^#\s+.+$/m.test(body)) fail(file, null, 'Нет заголовка `# …` — у страницы не будет названия');

  // Схемы: каждую через сборщик Presentbook.
  const fenceRe = /^```mermaid\n([\s\S]*?)^```/gm;
  for (const m of body.matchAll(fenceRe)) {
    const line = bodyStart + body.slice(0, m.index).split('\n').length;
    if (egm.mermaidToHtml(m[1]).includes('<figcaption>Схема</figcaption><pre>')) {
      fail(file, line, 'Схему mermaid сборщик Presentbook не разобрал — на странице будет исходник. Формы — docs/PLAN.md «Формат глав»');
    }
  }

  for (const { line, text } of proseLines(body, bodyStart)) {
    for (const tag of text.matchAll(/<\/?([a-zA-Z][\w-]*)([^>]*)>/g)) {
      const name = tag[1].toLowerCase();
      const attrs = tag[2].replace(/\/\s*$/, '').trim();
      if (!ALLOWED_TAGS.has(name) || attrs) {
        fail(file, line, `HTML \`${tag[0]}\` Presentbook покажет текстом: можно только details, summary, small, br без атрибутов`);
      }
    }
    if (/!\[[^\]]*\]\(/.test(text)) fail(file, line, 'Картинка: Presentbook покажет только подпись');
    for (const link of text.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const href = link[1];
      const sibling = href.replace(/^\.\//, '').replace(/#.*$/, '');
      const ok = /^https?:\/\//i.test(href) || /^mailto:/i.test(href) || href.startsWith('#') || files.includes(sibling);
      if (!ok) fail(file, line, `Ссылка \`${href}\` станет текстом: только http(s), mailto, якорь или соседняя глава`);
    }
  }

  // Логины и личные репозитории — во всём файле, включая frontmatter и код.
  raw.split('\n').forEach((text, i) => {
    const m = text.match(PERSONAL);
    if (m) fail(file, i + 1, `Логин или личный репозиторий \`${m[0]}\`: автор — только именем (решение PD по #275)`);
  });

  // Последняя страховка: сборка целиком, экранированные теги вне кода.
  const html = md.parse(body.replace(/^#\s+.+$/m, ''));
  const outsideCode = html.replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');
  if (errors === before && /&lt;\/?[a-zA-Z]/.test(outsideCode)) {
    fail(file, null, 'В собранной странице есть экранированный HTML — проверь теги в тексте');
  }

  console.log(`${errors === before ? 'ok   ' : 'ОШИБКА'} ${file}`);
}

if (errors) {
  console.log(`\nОшибок: ${errors}. Главы не соберутся в Presentbook без правок.`);
  process.exit(1);
}
console.log(`\nВсе ${files.length} файлов соберутся в Presentbook (сборщик: ${CONVERTER_URL}).`);
