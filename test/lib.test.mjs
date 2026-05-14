import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractMeta, discoverTools } from '../lib.mjs';

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
