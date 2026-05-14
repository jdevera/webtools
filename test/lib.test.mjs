import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractMeta, discoverTools, renderIndex, main } from '../lib.mjs';

test('extractMeta pulls title and description from HTML', () => {
  const html = `
    <!doctype html>
    <html><head>
      <title>Hello</title>
      <meta name="description" content="A greeting">
    </head></html>
  `;
  const meta = extractMeta(html);
  assert.equal(meta.title, 'Hello');
  assert.equal(meta.description, 'A greeting');
});

test('extractMeta trims whitespace around title', () => {
  const html = `<title>  Spaced  </title><meta name="description" content="x">`;
  assert.equal(extractMeta(html).title, 'Spaced');
});

test('extractMeta throws when <title> is missing', () => {
  const html = `<html><head><meta name="description" content="x"></head></html>`;
  assert.throws(() => extractMeta(html), /missing.*title/i);
});

test('extractMeta throws when description meta is missing', () => {
  const html = `<html><head><title>Hi</title></head></html>`;
  assert.throws(() => extractMeta(html), /missing.*description/i);
});

test('extractMeta accepts single-quoted meta attributes', () => {
  const html = `<title>X</title><meta name='description' content='y'>`;
  assert.equal(extractMeta(html).description, 'y');
});

test('extractMeta accepts trailing attributes on description meta', () => {
  const html = `<title>X</title><meta name="description" content="y" id="d">`;
  assert.equal(extractMeta(html).description, 'y');
});

test('extractMeta accepts self-closing description meta', () => {
  const html = `<title>X</title><meta name="description" content="z" />`;
  assert.equal(extractMeta(html).description, 'z');
});

function makeToolsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'htmltools-tools-'));
}

function writeTool(dir, slug, title, desc) {
  fs.mkdirSync(path.join(dir, slug), { recursive: true });
  fs.writeFileSync(
    path.join(dir, slug, 'index.html'),
    `<title>${title}</title><meta name="description" content="${desc}">`
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

test('discoverTools skips folders without index.html', () => {
  const dir = makeToolsDir();
  fs.mkdirSync(path.join(dir, 'empty-folder'));
  writeTool(dir, 'real', 'Real', 'x');

  const tools = discoverTools(dir);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].slug, 'real');
});

test('discoverTools skips loose files at the top level', () => {
  const dir = makeToolsDir();
  fs.writeFileSync(path.join(dir, 'README.md'), '# notes');
  writeTool(dir, 'real', 'Real', 'x');

  const tools = discoverTools(dir);
  assert.equal(tools.length, 1);
});

test('discoverTools error mentions the offending file path', () => {
  const dir = makeToolsDir();
  fs.mkdirSync(path.join(dir, 'broken'));
  fs.writeFileSync(path.join(dir, 'broken/index.html'), '<title>No description</title>');

  assert.throws(
    () => discoverTools(dir),
    (err) => err.message.includes(path.join(dir, 'broken', 'index.html'))
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
  assert.match(html, /<a href="\/tools\/alpha\/">/);
  assert.match(html, /<a href="\/tools\/bravo\/">/);
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
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'htmltools-build-'));

  fs.mkdirSync(path.join(repoDir, '_index'));
  fs.writeFileSync(
    path.join(repoDir, '_index/template.html'),
    '<html><body><ul><!-- TOOLS --></ul></body></html>'
  );
  fs.writeFileSync(path.join(repoDir, '_index/style.css'), 'body{color:red}');

  fs.mkdirSync(path.join(repoDir, 'tools/foo'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'tools/foo/index.html'),
    '<title>Foo</title><meta name="description" content="F"><body>foo</body>'
  );
  fs.mkdirSync(path.join(repoDir, 'tools/foo/assets'));
  fs.writeFileSync(path.join(repoDir, 'tools/foo/assets/icon.svg'), '<svg/>');

  const distDir = path.join(repoDir, 'dist');
  main({ repoDir, distDir });

  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html exists');
  assert.ok(fs.existsSync(path.join(distDir, '_index/style.css')), 'style.css copied');
  assert.ok(fs.existsSync(path.join(distDir, 'tools/foo/index.html')), 'tool index copied');
  assert.ok(fs.existsSync(path.join(distDir, 'tools/foo/assets/icon.svg')), 'tool subfile copied');
  assert.ok(!fs.existsSync(path.join(distDir, '_index/template.html')), 'template not copied');

  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert.match(indexHtml, /<a href="\/tools\/foo\/">/);
});

test('main wipes dist before building (stale files removed)', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'htmltools-build-'));
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
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'htmltools-build-'));
  fs.mkdirSync(path.join(repoDir, '_index'));
  fs.writeFileSync(path.join(repoDir, '_index/template.html'), '<!-- TOOLS -->');
  fs.writeFileSync(path.join(repoDir, '_index/style.css'), '');
  fs.mkdirSync(path.join(repoDir, '_index/fonts'));
  fs.writeFileSync(path.join(repoDir, '_index/fonts/foo.woff2'), 'binary');

  const distDir = path.join(repoDir, 'dist');
  main({ repoDir, distDir });

  assert.ok(fs.existsSync(path.join(distDir, '_index/fonts/foo.woff2')), 'subdir file copied');
});
