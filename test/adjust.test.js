import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustBars } from '../lib/adjust.js';

const D = 86400;
const bar = (day, c, v = 100) => ({ time: day * D, open: c, high: c, low: c, close: c, volume: v });
// a 1:1 bonus on day 3: the price halves, so the ratio across the ex-date is 2
const bars = [bar(1, 100), bar(2, 100), bar(3, 50), bar(4, 52)];

test('bars before the ex-date are divided by the ratio, the ex-date bar and later ones are not', () => {
  const { bars: out, applied } = adjustBars(bars, [{ time: 3 * D, ratio: 2 }]);
  assert.deepEqual(out.map((b) => b.close), [50, 50, 50, 52]);
  assert.equal(applied, 1);
});

test('volume is divided by the same factor, so value traded stays the same', () => {
  const { bars: out } = adjustBars(bars, [{ time: 3 * D, ratio: 2 }]);
  assert.deepEqual(out.map((b) => b.volume), [200, 200, 100, 100]);
  assert.equal(out[0].close * out[0].volume, bars[0].close * bars[0].volume);
});

test('the input bars are left as they were', () => {
  const before = JSON.stringify(bars);
  adjustBars(bars, [{ time: 3 * D, ratio: 2 }]);
  assert.equal(JSON.stringify(bars), before);
});

test('two ex-dates multiply, and the order they are given in does not matter', () => {
  const acts = [{ time: 4 * D, ratio: 1.04 }, { time: 3 * D, ratio: 2 }];
  const { bars: out, applied } = adjustBars(bars, acts);
  assert.equal(applied, 2);
  assert.ok(Math.abs(out[0].close - 100 / 2 / 1.04) < 1e-9);
  assert.ok(Math.abs(out[2].close - 50 / 1.04) < 1e-9);
  assert.deepEqual(adjustBars(bars, [...acts].reverse()).bars, out);
});

test('an ex-date on or before the first bar changes nothing', () => {
  const { bars: out, applied } = adjustBars(bars, [{ time: 1 * D, ratio: 2 }, { time: 0, ratio: 3 }]);
  assert.equal(applied, 0);
  assert.deepEqual(out.map((b) => b.close), [100, 100, 50, 52]);
  assert.notEqual(out[0], bars[0], 'a copy, not the cached bar');
});

test('no actions and no bars are fine', () => {
  assert.equal(adjustBars(bars, []).applied, 0);
  assert.deepEqual(adjustBars([], [{ time: D, ratio: 2 }]).bars, []);
});
