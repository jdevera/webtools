import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMeta } from '../lib.mjs';

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
