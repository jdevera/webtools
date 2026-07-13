import fs from 'node:fs';
import path from 'node:path';

const TITLE_RE = /<title>([^<]+)<\/title>/i;
const DESC_RE = /<p\s+class=["']description["'][^>]*>([\s\S]*?)<\/p>/i;

// Tool pages are HTML, so extracted text may carry entities; decode them to
// plain text here so renderIndex can escape exactly once.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function extractMeta(html) {
  const titleMatch = html.match(TITLE_RE);
  if (!titleMatch) throw new Error('missing <title>');
  const descMatch = html.match(DESC_RE);
  if (!descMatch) throw new Error('missing <p class="description">');
  return {
    title: decodeEntities(titleMatch[1]).trim(),
    description: decodeEntities(descMatch[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(),
  };
}

const RESERVED_SLUGS = new Set(['index']);

export function discoverTools(toolsDir) {
  const entries = fs.readdirSync(toolsDir, { withFileTypes: true });
  const tools = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.html')) continue;
    const slug = entry.name.slice(0, -'.html'.length);
    const filePath = path.join(toolsDir, entry.name);
    if (RESERVED_SLUGS.has(slug) || slug.startsWith('_')) {
      throw new Error(`${filePath}: slug "${slug}" is reserved`);
    }
    const html = fs.readFileSync(filePath, 'utf8');
    let meta;
    try {
      meta = extractMeta(html);
    } catch (e) {
      throw new Error(`${filePath}: ${e.message}`);
    }
    tools.push({ slug, title: meta.title, description: meta.description });
  }
  tools.sort((a, b) => a.title.localeCompare(b.title));
  return tools;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function renderIndex(template, tools) {
  const items = tools.map((t) =>
    `<li><a href="/${encodeURIComponent(t.slug)}">` +
    `<strong>${escapeHtml(t.title)}</strong>` +
    `<small>${escapeHtml(t.description)}</small>` +
    `</a></li>`
  ).join('\n');
  return template.replace('<!-- TOOLS -->', items);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function main({ repoDir = process.cwd(), distDir = path.join(repoDir, 'dist') } = {}) {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const toolsDir = path.join(repoDir, 'tools');
  const tools = fs.existsSync(toolsDir) ? discoverTools(toolsDir) : [];

  const template = fs.readFileSync(path.join(repoDir, '_index/template.html'), 'utf8');
  fs.writeFileSync(path.join(distDir, 'index.html'), renderIndex(template, tools));

  const indexSrc = path.join(repoDir, '_index');
  const indexDst = path.join(distDir, '_index');
  fs.mkdirSync(indexDst, { recursive: true });
  for (const entry of fs.readdirSync(indexSrc, { withFileTypes: true })) {
    if (entry.name === 'template.html') continue;
    const s = path.join(indexSrc, entry.name);
    const d = path.join(indexDst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }

  for (const tool of tools) {
    const file = `${tool.slug}.html`;
    fs.copyFileSync(path.join(toolsDir, file), path.join(distDir, file));
  }
}
