import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const html = fs.readFileSync(new URL('../tools/giraffedoku.html', import.meta.url), 'utf8');
const match = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
assert.ok(match, 'engine script block not found');
const tmp = path.join(os.tmpdir(), `giraffedoku-engine-${process.pid}.mjs`);
fs.writeFileSync(tmp, `${match[1]}\nexport default Giraffe;`);
const E = (await import(pathToFileURL(tmp).href)).default;
fs.unlinkSync(tmp);

const N = 8;
const rng = () => E.rngFromString('test-seed');

test('randomPlacement yields one giraffe per row/column, none adjacent', () => {
  const cols = E.randomPlacement(N, rng());
  assert.equal(cols.length, N);
  assert.equal(new Set(cols).size, N, 'columns must be distinct');
  for (let r = 1; r < N; r++) {
    assert.ok(Math.abs(cols[r] - cols[r - 1]) >= 2, `rows ${r - 1},${r} adjacent`);
  }
});

test('growRegions produces a connected partition seeded on the solution', () => {
  const r = rng();
  const cols = E.randomPlacement(N, r);
  const regions = E.growRegions(N, cols, r);
  assert.equal(regions.length, N * N);
  assert.ok(regions.every((g) => g >= 0 && g < N), 'every cell assigned a region');
  assert.equal(new Set(regions).size, N, 'exactly N regions');
  for (let row = 0; row < N; row++) {
    assert.equal(regions[row * N + cols[row]], row, 'seed cell keeps its region');
  }
  // each region orthogonally connected (BFS from any cell of the region)
  for (let g = 0; g < N; g++) {
    const cellsOf = [];
    for (let i = 0; i < N * N; i++) if (regions[i] === g) cellsOf.push(i);
    const seen = new Set([cellsOf[0]]);
    const queue = [cellsOf[0]];
    while (queue.length) {
      const i = queue.pop();
      const row = Math.floor(i / N), col = i % N;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const rr = row + dr, cc = col + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const j = rr * N + cc;
        if (regions[j] === g && !seen.has(j)) { seen.add(j); queue.push(j); }
      }
    }
    assert.equal(seen.size, cellsOf.length, `region ${g} is disconnected`);
  }
});

test('countSolutions finds multiple solutions on an ambiguous board', () => {
  // column stripes: region constraint duplicates the column constraint,
  // so every valid non-adjacent placement solves it
  const n = 6;
  const regions = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) regions.push(c);
  assert.equal(E.countSolutions(n, regions, 2), 2);
});

test('generate produces unique puzzles that logic alone can solve', () => {
  for (const [sizes, tier] of [[[6], 1], [[8], 2], [[10], 3]]) {
    const p = E.generate(sizes, tier, `gen-${tier}`, 60);
    assert.ok(p, `no puzzle generated for tier ${tier}`);
    assert.equal(E.countSolutions(p.n, p.regions), 1, 'solution must be unique');
    const rating = E.ratePuzzle(E.makeGeom(p.n, p.regions));
    assert.ok(rating.solved, 'logic solver must finish the puzzle');
    assert.equal(rating.tier, p.tier, 'reported tier matches rating');
    // the embedded solution actually solves the puzzle
    const solSet = p.solution.map((c, r) => r * p.n + c);
    assert.equal(new Set(solSet.map((i) => p.regions[i])).size, p.n, 'one giraffe per region');
  }
});

test('hard puzzles require repeated tier-3 reasoning', () => {
  const p = E.generate([10, 11], 3, 'hard-density', 60);
  assert.ok(p, 'no hard puzzle generated');
  assert.ok(p.exact, 'expected an exact-difficulty hard puzzle');
  const rating = E.ratePuzzle(E.makeGeom(p.n, p.regions));
  const t3 = rating.steps.filter((s) => s.tier === 3).length;
  assert.ok(t3 >= 4, `expected >=4 tier-3 steps, got ${t3}`);
  assert.equal(E.countSolutions(p.n, p.regions), 1);
});

test('generation is deterministic for a given seed', () => {
  const a = E.generate([8, 9], 2, 'same-seed', 60);
  const b = E.generate([8, 9], 2, 'same-seed', 60);
  assert.deepEqual(a.regions, b.regions);
  assert.deepEqual(a.solution, b.solution);
  assert.equal(a.n, b.n);
});

test('hint flags a misplaced giraffe before anything else', () => {
  const p = E.generate([6], 1, 'hint-seed', 60);
  const geom = E.makeGeom(p.n, p.regions);
  const names = ['red', 'blue', 'green', 'gold', 'purple', 'teal'];
  const wrong = p.solution[0] === 0 ? p.n - 1 : 0; // any non-solution cell in row 0
  const h = E.hint(geom, p.solution, { giraffes: [wrong], xs: [] }, names);
  assert.equal(h.type, 'removeGiraffe');
  assert.deepEqual(h.cells, [wrong]);
});

test('hint flags an X sitting on the solution', () => {
  const p = E.generate([6], 1, 'hint-seed', 60);
  const geom = E.makeGeom(p.n, p.regions);
  const names = ['red', 'blue', 'green', 'gold', 'purple', 'teal'];
  const solCell = p.solution[0]; // row 0 solution cell index
  const h = E.hint(geom, p.solution, { giraffes: [], xs: [solCell] }, names);
  assert.equal(h.type, 'removeX');
});

test('contradiction hints record the forced chain and prefer the shallowest', () => {
  const p = E.generate([10, 11], 3, 'contra-a', 60);
  const geom = E.makeGeom(p.n, p.regions);
  const state = E.newState(geom);
  const apply = (s) => { if (s.type === 'place') E.placeAt(state, s.cell); else for (const c of s.cells) state.cand[c] = 1; };
  let step;
  while ((step = E.findStep(state, 3)) && step.rule !== 'contradiction') {
    apply(step);
    assert.ok(state.placed < p.n, 'expected a contradiction step before the puzzle solved');
  }
  assert.ok(step, 'solver got stuck without a contradiction step');
  assert.ok(Array.isArray(step.chain), 'contradiction steps carry their forced chain');
  for (const link of step.chain) {
    assert.ok(Number.isInteger(link.cell));
    assert.ok(['region', 'row', 'col'].includes(link.why.kind));
  }
  const best = E.findContradiction(state, true);
  assert.ok(best.chain.length <= step.chain.length, 'best scan must not pick a deeper chain');
  // the hint uses the shallow scan and words the step to match its depth
  const board = { giraffes: [], xs: [] };
  for (let i = 0; i < p.n * p.n; i++) {
    if (state.cand[i] === 2) board.giraffes.push(i);
    else if (state.cand[i] === 1) board.xs.push(i);
  }
  const names = Array.from({ length: p.n }, (_, i) => `color${i}`);
  const h = E.hint(geom, p.solution, board, names);
  assert.equal(h.type, 'elim');
  assert.equal(h.chain.length, best.chain.length);
  if (h.chain.length === 0) {
    assert.match(h.text, /would take away every cell/);
  } else {
    assert.match(h.text, /ghosted cells/);
  }
});

test('hint returns a logical step on a fresh board', () => {
  const p = E.generate([6], 1, 'hint-seed', 60);
  const geom = E.makeGeom(p.n, p.regions);
  const names = ['red', 'blue', 'green', 'gold', 'purple', 'teal'];
  const h = E.hint(geom, p.solution, { giraffes: [], xs: [] }, names);
  assert.ok(h, 'expected a hint');
  assert.ok(['place', 'elim'].includes(h.type), `unexpected hint type ${h.type}`);
  assert.ok(h.cells.length >= 1);
  assert.ok(h.text.length > 10);
});
