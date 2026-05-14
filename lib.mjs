import fs from 'node:fs';
import path from 'node:path';

const TITLE_RE = /<title>([^<]+)<\/title>/i;
const DESC_RE = /<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i;

export function extractMeta(html) {
  const titleMatch = html.match(TITLE_RE);
  if (!titleMatch) throw new Error('missing <title>');
  const descMatch = html.match(DESC_RE);
  if (!descMatch) throw new Error('missing <meta name="description">');
  return {
    title: titleMatch[1].trim(),
    description: descMatch[1].trim(),
  };
}

export function discoverTools(toolsDir) {
  const entries = fs.readdirSync(toolsDir, { withFileTypes: true });
  const tools = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(toolsDir, entry.name, 'index.html');
    if (!fs.existsSync(indexPath)) continue;
    const html = fs.readFileSync(indexPath, 'utf8');
    let meta;
    try {
      meta = extractMeta(html);
    } catch (e) {
      throw new Error(`${indexPath}: ${e.message}`);
    }
    tools.push({ slug: entry.name, title: meta.title, description: meta.description });
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
    `<li><a href="/tools/${encodeURIComponent(t.slug)}/">` +
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

  if (fs.existsSync(toolsDir)) {
    copyDir(toolsDir, path.join(distDir, 'tools'));
  }
}
