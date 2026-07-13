import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractMeta, discoverTools, renderIndex, main } from '../lib.mjs';

test('extractMeta pulls title and description paragraph', () => {
  const html = `
    <!doctype html>
    <html><head><title>Hello</title></head>
    <body><p class="description">A greeting</p></body></html>
  `;
  const meta = extractMeta(html);
  assert.equal(meta.title, 'Hello');
  assert.equal(meta.description, 'A greeting');
});

test('extractMeta trims whitespace around title', () => {
  const html = `<title>  Spaced  </title><p class="description">x</p>`;
  assert.equal(extractMeta(html).title, 'Spaced');
});

test('extractMeta throws when <title> is missing', () => {
  const html = `<html><body><p class="description">x</p></body></html>`;
  assert.throws(() => extractMeta(html), /missing.*title/i);
});

test('extractMeta throws when description paragraph is missing', () => {
  const html = `<html><head><title>Hi</title></head></html>`;
  assert.throws(() => extractMeta(html), /missing.*description/i);
});

test('extractMeta accepts single-quoted class attribute', () => {
  const html = `<title>X</title><p class='description'>y</p>`;
  assert.equal(extractMeta(html).description, 'y');
});

test('extractMeta accepts trailing attributes on description paragraph', () => {
  const html = `<title>X</title><p class="description" id="d">y</p>`;
  assert.equal(extractMeta(html).description, 'y');
});

test('extractMeta strips inline tags inside description', () => {
  const html = `<title>X</title><p class="description">Has <em>emphasis</em> and <a href="/x">a link</a>.</p>`;
  assert.equal(extractMeta(html).description, 'Has emphasis and a link.');
});

test('extractMeta collapses whitespace inside multi-line description', () => {
  const html = `<title>X</title><p class="description">
    Line one.
    Line two.
  </p>`;
  assert.equal(extractMeta(html).description, 'Line one. Line two.');
});

test('extractMeta decodes HTML entities in the description', () => {
  const html = `<title>X</title><p class="description">A website&rsquo;s icons &amp; files &mdash; local&nbsp;only.</p>`;
  assert.equal(extractMeta(html).description, 'A website\u2019s icons & files \u2014 local only.');
});

test('extractMeta decodes numeric entities in title and description', () => {
  const html = `<title>X&#39;s</title><p class="description">&#x2014; dash &#8230;</p>`;
  assert.equal(extractMeta(html).title, "X's");
  assert.equal(extractMeta(html).description, '\u2014 dash \u2026');
});

test('extractMeta leaves unknown entities untouched', () => {
  const html = `<title>X</title><p class="description">&unknown; stays</p>`;
  assert.equal(extractMeta(html).description, '&unknown; stays');
});

function makeToolsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'webtools-tools-'));
}

function writeTool(dir, slug, title, desc) {
  fs.writeFileSync(
    path.join(dir, `${slug}.html`),
    `<title>${title}</title><p class="description">${desc}</p>`
  );
}

test('discoverTools returns tools sorted by title', () => {
  const dir = makeToolsDir();
  writeTool(dir, 'bravo', 'Bravo Tool', 'B');
  writeTool(dir, 'alpha', 'Alpha Tool', 'A');

  const tools = discoverTools(dir);
  assert.deepEqual(tools, [
    { slug: 'alpha', title: 'Alpha Tool', description: 'A' },
    { slug: 'bravo', title: 'Bravo Tool', description: 'B' },
  ]);
});

test('discoverTools skips non-html files', () => {
  const dir = makeToolsDir();
  fs.writeFileSync(path.join(dir, 'README.md'), '# notes');
  writeTool(dir, 'real', 'Real', 'x');

  const tools = discoverTools(dir);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].slug, 'real');
});

test('discoverTools skips subdirectories', () => {
  const dir = makeToolsDir();
  fs.mkdirSync(path.join(dir, 'subfolder'));
  fs.writeFileSync(path.join(dir, 'subfolder/index.html'), '<title>x</title><p class="description">y</p>');
  writeTool(dir, 'real', 'Real', 'x');

  const tools = discoverTools(dir);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].slug, 'real');
});

test('discoverTools rejects reserved slug "index"', () => {
  const dir = makeToolsDir();
  writeTool(dir, 'index', 'Bad', 'no');

  assert.throws(() => discoverTools(dir), /reserved/i);
});

test('discoverTools rejects slugs starting with underscore', () => {
  const dir = makeToolsDir();
  writeTool(dir, '_secret', 'Bad', 'no');

  assert.throws(() => discoverTools(dir), /reserved/i);
});

test('discoverTools error mentions the offending file path', () => {
  const dir = makeToolsDir();
  fs.writeFileSync(path.join(dir, 'broken.html'), '<title>No description</title>');

  assert.throws(
    () => discoverTools(dir),
    (err) => err.message.includes(path.join(dir, 'broken.html'))
      && /description/i.test(err.message)
  );
});

test('renderIndex replaces <!-- TOOLS --> with li items', () => {
  const template = '<ul><!-- TOOLS --></ul>';
  const tools = [
    { slug: 'alpha', title: 'Alpha', description: 'First' },
    { slug: 'bravo', title: 'Bravo', description: 'Second' },
  ];
  const html = renderIndex(template, tools);
  assert.match(html, /<a href="\/alpha">/);
  assert.match(html, /<a href="\/bravo">/);
  assert.match(html, /<strong>Alpha<\/strong>/);
  assert.match(html, /First/);
  assert.ok(html.indexOf('alpha') < html.indexOf('bravo'), 'order from input is preserved');
});

test('renderIndex escapes HTML in title and description', () => {
  const template = '<!-- TOOLS -->';
  const tools = [{
    slug: 'x',
    title: '<script>alert(1)</script>',
    description: 'a "&" b',
  }];
  const html = renderIndex(template, tools);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script must not appear');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;&amp;&quot;/);
});

test('renderIndex with empty tools list produces empty placeholder', () => {
  const template = '<ul><!-- TOOLS --></ul>';
  const html = renderIndex(template, []);
  assert.equal(html, '<ul></ul>');
});

test('main builds dist with index, copied tools, and copied styles', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webtools-build-'));

  fs.mkdirSync(path.join(repoDir, '_index'));
  fs.writeFileSync(
    path.join(repoDir, '_index/template.html'),
    '<html><body><ul><!-- TOOLS --></ul></body></html>'
  );
  fs.writeFileSync(path.join(repoDir, '_index/style.css'), 'body{color:red}');

  fs.mkdirSync(path.join(repoDir, 'tools'));
  fs.writeFileSync(
    path.join(repoDir, 'tools/foo.html'),
    '<title>Foo</title><body><p class="description">F</p>foo</body>'
  );

  const distDir = path.join(repoDir, 'dist');
  main({ repoDir, distDir });

  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html exists');
  assert.ok(fs.existsSync(path.join(distDir, '_index/style.css')), 'style.css copied');
  assert.ok(fs.existsSync(path.join(distDir, 'foo.html')), 'tool copied to dist root');
  assert.ok(!fs.existsSync(path.join(distDir, '_index/template.html')), 'template not copied');

  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert.match(indexHtml, /<a href="\/foo">/);
});

test('main wipes dist before building (stale files removed)', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webtools-build-'));
  fs.mkdirSync(path.join(repoDir, '_index'));
  fs.writeFileSync(path.join(repoDir, '_index/template.html'), '<!-- TOOLS -->');
  fs.writeFileSync(path.join(repoDir, '_index/style.css'), '');

  const distDir = path.join(repoDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'stale.txt'), 'should be removed');

  main({ repoDir, distDir });

  assert.ok(!fs.existsSync(path.join(distDir, 'stale.txt')), 'stale files cleared');
});

test('main copies subdirectories inside _index/', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webtools-build-'));
  fs.mkdirSync(path.join(repoDir, '_index'));
  fs.writeFileSync(path.join(repoDir, '_index/template.html'), '<!-- TOOLS -->');
  fs.writeFileSync(path.join(repoDir, '_index/style.css'), '');
  fs.mkdirSync(path.join(repoDir, '_index/fonts'));
  fs.writeFileSync(path.join(repoDir, '_index/fonts/foo.woff2'), 'binary');

  const distDir = path.join(repoDir, 'dist');
  main({ repoDir, distDir });

  assert.ok(fs.existsSync(path.join(distDir, '_index/fonts/foo.woff2')), 'subdir file copied');
});
