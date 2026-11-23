import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChartPatterns, distToSegment, patternColour, patternSizePct, patternStage, passesFilter, patternEvents } from '../public/js/chart-patterns.js';

test('distance to a segment: along it, past its end, and off to the side', () => {
  assert.equal(distToSegment(5, 3, 0, 0, 10, 0), 3);
  assert.equal(distToSegment(13, 4, 0, 0, 10, 0), 5, 'measured to the nearer end');
  assert.equal(distToSegment(5, 0, 0, 0, 10, 0), 0);
  assert.equal(distToSegment(2, 2, 4, 4, 4, 4), Math.hypot(2, 2), 'a segment that is a point');
});

test('a click picks the label first, then the nearest line within a few pixels, else nothing', () => {
  const cp = new ChartPatterns({}, []);
  cp.geom = [
    { key: 'A', segs: [[0, 100, 100, 100]], pills: [{ x: 10, y: 20, w: 80 }] },
    { key: 'B', segs: [[0, 104, 100, 104]], pills: [] },
  ];
  assert.equal(cp.hit(20, 25), 'A', 'inside the label');
  assert.equal(cp.hit(50, 101), 'A', 'one pixel from A\'s line, three from B\'s: the nearer wins');
  assert.equal(cp.hit(50, 106), 'B');
  assert.equal(cp.hit(50, 140), null, 'nowhere near a pattern');
  assert.equal(cp.hit(50, 50), null);
});

test('colours follow direction and status, and differ by theme', () => {
  const bull = { dir: 'bull', status: 'Awaiting' }, bear = { dir: 'bear', status: 'Reached' };
  assert.notEqual(patternColour(bull), patternColour(bear));
  assert.equal(patternColour({ ...bull, status: 'Failed' }), patternColour({ ...bear, status: 'Failed' }), 'failed ones are all grey');
  assert.notEqual(patternColour(bull, 'dark'), patternColour(bull, 'light'));
  assert.notEqual(patternColour({ ...bull, inProgress: true }), patternColour(bull));
});

// A drawing surface that accepts every call; text is 40 px wide.
const fakeCtx = () => new Proxy({ measureText: () => ({ width: 40 }) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true });
const pattern = (extra = {}) => ({
  key: 'P', type: 'Double Bottom', dir: 'bull', status: 'Awaiting', breakI: 8,
  points: [{ i: 2, price: 100 }, { i: 5, price: 90 }, { i: 8, price: 100 }], lines: [],
  entry: 101, stop: 88, target: { fromI: 8, toI: 12, price: 112 }, ...extra,
});

test('the stop and entry labels at the right edge are not click targets, so a click there lets go of the pattern', () => {
  globalThis.document = { documentElement: { dataset: {} } };
  const cp = new ChartPatterns({ chart: { timeScale: () => ({ logicalToCoordinate: (i) => i * 20 }) } }, [pattern()]);
  cp.series = { priceToCoordinate: (p) => 300 - p };
  cp.selected = 'P';
  cp.draw(fakeCtx(), { width: 700, height: 400 });
  const yStop = 300 - 88, yEntry = 300 - 101;
  assert.equal(cp.hit(600, yStop), null, 'on the Stop label');
  assert.equal(cp.hit(600, yEntry), null, 'on the Entry label');
  assert.equal(cp.hit(5 * 20, 300 - 90), 'P', 'the pattern itself is still hit');
});

test('size is the height of the figure as a percentage of its mid price', () => {
  assert.ok(Math.abs(patternSizePct(pattern()) - (10 / 95) * 100) < 1e-9);
});

test('the stage says whether a pattern is forming, broke out, reached its target or failed', () => {
  assert.equal(patternStage(pattern({ breakI: null })), 'live');
  assert.equal(patternStage(pattern()), 'broken');
  assert.equal(patternStage(pattern({ status: 'Reached' })), 'reached');
  assert.equal(patternStage(pattern({ status: 'Failed' })), 'failed');
});

test('the quality filter keeps patterns by stage and by minimum size', () => {
  const big = pattern(), small = pattern({ points: [{ i: 2, price: 100 }, { i: 5, price: 99 }, { i: 8, price: 100 }] });
  assert.equal(passesFilter(big, null), true);
  assert.equal(passesFilter(big, { status: 'all', minSize: 0 }), true);
  assert.equal(passesFilter(big, { status: 'broken' }), true);
  assert.equal(passesFilter(big, { status: 'failed' }), false);
  assert.equal(passesFilter(small, { status: 'all', minSize: 5 }), false, 'about 1% is under 5%');
  assert.equal(passesFilter(big, { status: 'all', minSize: 5 }), true);
});

test('alerts: a pattern seen before gives one event when it breaks out, reaches its target or fails; new ones give none', () => {
  const seen = (p) => new Map([[p.key, { broke: p.breakI != null, status: p.status }]]);
  const forming = pattern({ breakI: null });
  assert.deepEqual(patternEvents(seen(forming), [forming]), [], 'nothing changed');
  assert.deepEqual(patternEvents(new Map(), [pattern()]), [], 'just found, not changed');
  const broke = patternEvents(seen(forming), [pattern()]);
  assert.equal(broke.length, 1);
  assert.match(broke[0].text, /broke out up: entry 101\.00, stop 88\.00, target 112\.00/);
  assert.match(patternEvents(seen(pattern()), [pattern({ status: 'Reached' })])[0].text, /reached its target 112\.00/);
  assert.match(patternEvents(seen(pattern()), [pattern({ status: 'Failed' })])[0].text, /failed.*88\.00/);
  assert.equal(patternEvents(seen(pattern({ status: 'Reached' })), [pattern({ status: 'Reached' })]).length, 0, 'already reached');
});
