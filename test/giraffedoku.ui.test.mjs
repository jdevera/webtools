import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../tools/giraffedoku.html', import.meta.url), 'utf8');

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function waitFor(cond, what, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return;
    await sleep(25);
  }
  assert.fail(`timed out waiting for ${what}`);
}

async function boot(query = '') {
  const dom = new JSDOM(html, {
    url: `https://example.test/giraffedoku${query}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const $ = (id) => dom.window.document.getElementById(id);
  // generation is chunked/async; the label is set when the puzzle is ready
  await waitFor(() => $('puzzle-label').textContent.length > 0, 'initial puzzle');
  return { dom, $ };
}

const DAILY_RE = /^Daily · \d{1,2} [A-Z][a-z]{2} \d{4} · \d+×\d+ · (easy|medium|hard)$/;

test('daily boot: medium daily with a working difficulty selector', async () => {
  const { dom, $ } = await boot();
  try {
    const label = $('puzzle-label').textContent;
    assert.match(label, DAILY_RE, `bad daily label: "${label}"`);
    assert.ok(label.endsWith('medium'));
    assert.ok(!label.includes('Invalid Date'));
    assert.ok($('tab-daily').classList.contains('active'));
    assert.equal($('diff').hidden, false, 'difficulty selector must be visible on the daily tab');
    assert.equal($('diff').querySelectorAll('button').length, 3);
    assert.equal($('new').hidden, true, 'New puzzle is free-play only');
    assert.equal($('timer').hidden, false, 'daily shows the timer');

    // switching difficulty stays a daily, at the chosen difficulty
    $('diff').querySelector('button[data-d="easy"]').click();
    await waitFor(() => $('puzzle-label').textContent.endsWith('easy'), 'easy daily');
    const easyLabel = $('puzzle-label').textContent;
    assert.match(easyLabel, DAILY_RE, `bad easy daily label: "${easyLabel}"`);
    assert.equal(dom.window.location.search, '?mode=daily&diff=easy');

    // free play generates a seeded puzzle at the current difficulty
    $('tab-free').click();
    await waitFor(() => $('puzzle-label').textContent.startsWith('Free play'), 'free puzzle');
    assert.match($('puzzle-label').textContent, /^Free play · easy(?: \(closest fit\))? · \d+×\d+ · seed \w+$/);
    assert.equal($('new').hidden, false);
    assert.match(dom.window.location.search, /^\?diff=easy&seed=\w+$/);
  } finally {
    dom.window.close();
  }
});

test('boot from a shared free-play URL uses its seed and difficulty', async () => {
  const { dom, $ } = await boot('?diff=easy&seed=abc123');
  try {
    assert.match($('puzzle-label').textContent, /^Free play · easy(?: \(closest fit\))? · \d+×\d+ · seed abc123$/);
    assert.equal($('timer').hidden, true, 'free play has no timer');
  } finally {
    dom.window.close();
  }
});

test('winning shows a modal that describes the solved puzzle', async () => {
  const { dom, $ } = await boot('?mode=daily&diff=easy');
  try {
    const label = $('puzzle-label').textContent;
    assert.ok(label.endsWith('easy'), `expected an easy daily, got "${label}"`);
    // solve through the UI: request a hint and apply it until the board is done
    for (let i = 0; i < 500 && $('overlay').hidden; i++) {
      $('hint-btn').click();
      assert.equal($('apply').hidden, false, 'hint should be applicable');
      $('apply').click();
      await sleep(0);
    }
    assert.equal($('overlay').hidden, false, 'win modal should appear');
    assert.equal($('modal-ref').textContent, label, 'modal must describe the puzzle that was played');
    assert.match($('modal-ref').textContent, DAILY_RE);
    assert.equal($('modal-time').hidden, false, 'daily win shows the time');
    assert.match($('modal-hints').textContent, /^Hints used: \d+$/);
  } finally {
    dom.window.close();
  }
});

const encodeState = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('a state URL restores marks and trees; the debug bar can capture them back', async () => {
  const state = encodeState({ g: [], x: [0], w: [1], t: 2 });
  const { dom, $ } = await boot(`?diff=easy&seed=abc123&state=${state}&debug=1`);
  try {
    assert.equal($('debugbar').hidden, false, 'debug param shows the debug bar');
    const cells = dom.window.document.querySelectorAll('.cell');
    await waitFor(() => cells[0].classList.contains('x-manual'), 'restored state to render');
    assert.ok(cells[1].classList.contains('x-wrong'), 'wrong ✕ restored');
    assert.ok($('trees').innerHTML.includes('eaten'), 'lost tree restored');

    let copied = null;
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      value: { writeText: (t) => { copied = t; return Promise.resolve(); } },
      configurable: true,
    });
    $('save-state').click();
    await waitFor(() => copied !== null, 'state URL copied');
    assert.match(copied, /\?diff=easy&seed=abc123&state=[\w-]+&debug=1$/);
    const roundTrip = JSON.parse(Buffer.from(
      new URL(copied).searchParams.get('state').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    assert.deepEqual(roundTrip, { g: [], x: [0], w: [1], t: 2 });
  } finally {
    dom.window.close();
  }
});

test('without the debug param there is no debug bar', async () => {
  const { dom, $ } = await boot('?diff=easy&seed=abc123');
  try {
    assert.equal($('debugbar').hidden, true);
  } finally {
    dom.window.close();
  }
});

test('the hidden attribute always wins over display rules', () => {
  // a bare display:flex/grid on a container silently defeats [hidden];
  // the stylesheet must carry the global override
  assert.match(html, /\[hidden\]\s*{\s*display:\s*none\s*!important;?\s*}/);
});
