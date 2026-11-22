import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect, filter, PATTERNS } from '../public/lib/chartpatterns.js';

// Bars from a path of [bar, close] waypoints, straight lines between them, a thin high and low around each close.
const path = (pts) => {
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [i0, p0] = pts[k], [i1, p1] = pts[k + 1];
    for (let i = i0; i < i1; i++) out.push(p0 + ((p1 - p0) * (i - i0)) / (i1 - i0));
  }
  out.push(pts.at(-1)[1]);
  return out.map((c, i) => ({ time: i * 86400, open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 1000 }));
};
const mirror = (pts) => pts.map(([i, p]) => [i, 220 - p]);
const types = (bars, o) => detect(bars, o).map((p) => p.type);
const find = (bars, type, o) => detect(bars, o).find((p) => p.type === type);

const DOUBLE_TOP = [[0, 100], [15, 120], [30, 105], [45, 120], [60, 100], [75, 88]];
const TRIPLE_TOP = [[0, 100], [12, 120], [24, 105], [36, 120], [48, 105], [60, 120], [75, 90]];
const HEAD_SHOULDERS = [[0, 100], [12, 115], [24, 105], [40, 125], [56, 105], [70, 115], [90, 95]];
const RISING_WEDGE = [[0, 100], [10, 110], [20, 102], [30, 116], [40, 110], [50, 120], [60, 112], [72, 98]];
const TRIANGLE = [[0, 105], [10, 120], [20, 100], [30, 116], [40, 104], [50, 112], [58, 108], [66, 114], [74, 124]];
const RECTANGLE = [[0, 105], [10, 120], [20, 100], [30, 120], [40, 100], [50, 120], [56, 110], [64, 126], [74, 135]];
const BEAR_FLAG = [[0, 130], [10, 140], [20, 110], [28, 118], [36, 113], [44, 121], [52, 108], [70, 92]];
const BEAR_PENNANT = [[0, 130], [10, 140], [20, 110], [28, 124], [34, 114], [40, 120], [52, 108], [70, 92]];
const INVERTED_CUP = [[0, 110], [10, 100], [14, 112], [20, 118], [30, 120], [40, 118], [46, 112], [50, 100], [58, 106], [66, 96], [80, 82]];

test('each down pattern is found, and its mirror image is found as the up pattern', () => {
  const cases = [
    [DOUBLE_TOP, 'Double Top', 'Double Bottom'], [TRIPLE_TOP, 'Triple Top', 'Triple Bottom'],
    [HEAD_SHOULDERS, 'Head And Shoulders', 'Inverse Head And Shoulders'], [RISING_WEDGE, 'Rising Wedge', 'Falling Wedge'],
    [BEAR_FLAG, 'Bearish Flag', 'Bullish Flag'], [BEAR_PENNANT, 'Bearish Pennant', 'Bullish Pennant'],
    [INVERTED_CUP, 'Inverted Cup and Handle', 'Cup and Handle'],
  ];
  for (const [pts, down, up] of cases) {
    assert.ok(find(path(pts), down), `${down} on its own series`);
    assert.ok(find(path(mirror(pts)), up), `${up} on the flipped series`);
    assert.equal(find(path(pts), down).dir, 'bear');
    assert.equal(find(path(mirror(pts)), up).dir, 'bull');
  }
});

test('triangle and rectangle break either way', () => {
  const tri = find(path(TRIANGLE), 'Triangle'), rect = find(path(RECTANGLE), 'Rectangle');
  assert.ok(tri && rect);
  assert.equal(tri.dir, 'bull');
  assert.equal(rect.dir, 'bull');
  const down = find(path(TRIANGLE.map(([i, p], k) => (k >= 6 ? [i, 220 - p + 5] : [i, p]))), 'Triangle');
  assert.ok(down === undefined || down.dir === 'bear', 'a break the other way is a bear break');
  assert.ok(PATTERNS.length === 16, 'the 16 pattern names TradingView lists');
});

test('near misses are not read as the neighbouring pattern', () => {
  const equalHead = HEAD_SHOULDERS.map(([i, p]) => (i === 40 ? [i, 116] : [i, p]));
  const t = types(path(equalHead));
  assert.ok(!t.includes('Head And Shoulders'), 'a head 1% over the shoulders is not a head');
  assert.ok(t.includes('Triple Top'), 'three equal tops are a triple top');
  assert.ok(!types(path(RISING_WEDGE)).includes('Triangle'), 'a wedge slopes the same way on both lines');
  assert.ok(!types(path(RECTANGLE)).includes('Triangle'), 'flat lines are a rectangle');
  assert.ok(!types(path(TRIANGLE)).includes('Rectangle'));
  assert.ok(!types(path(BEAR_PENNANT)).includes('Rising Wedge'), 'after a pole, converging lines are a pennant');
  const noPole = BEAR_FLAG.map(([i, p]) => (i === 10 ? [i, 118] : [i, p]));
  assert.ok(!types(path(noPole)).includes('Bearish Flag'), 'without a pole there is no flag');
});

test('a triple top is one pattern, not a triple top plus the double tops inside it', () => {
  const t = types(path(TRIPLE_TOP));
  assert.equal(t.filter((x) => x === 'Triple Top').length, 1);
  assert.equal(t.filter((x) => x === 'Double Top').length, 0);
});

test('no repainting: what is found on the first k bars is found the same way on all of them', () => {
  for (const pts of [DOUBLE_TOP, TRIPLE_TOP, HEAD_SHOULDERS, RISING_WEDGE, BEAR_FLAG, INVERTED_CUP, TRIANGLE, mirror(HEAD_SHOULDERS)]) {
    const bars = path(pts), full = detect(bars);
    for (let k = 25; k < bars.length; k += 3) {
      for (const p of detect(bars.slice(0, k))) {
        const same = full.some((q) => q.type === p.type && q.points.map((x) => x.i).join() === p.points.map((x) => x.i).join());
        const ids = new Set(p.points.map((x) => x.i));
        // a lesser pattern may later be absorbed into a bigger one that reads the same pivots
        const absorbed = full.some((q) => q.points.filter((x) => ids.has(x.i)).length >= 2);
        assert.ok(same || absorbed, `${p.type} found on ${k} bars is gone from the full series`);
      }
    }
  }
});

test('status: Awaiting until the target is touched, Reached after, Failed when price goes the other way first', () => {
  const awaiting = find(path(HEAD_SHOULDERS), 'Head And Shoulders');
  assert.equal(awaiting.status, 'Awaiting');
  assert.ok(awaiting.breakI > 56 && awaiting.target.price < 105, 'the neckline broke and the target is below it');
  const reached = find(path([...HEAD_SHOULDERS.slice(0, -1), [90, 95], [105, 75]]), 'Head And Shoulders');
  assert.equal(reached.status, 'Reached');
  const dt = find(path(DOUBLE_TOP), 'Double Top');
  assert.equal(dt.status, 'Reached');
  assert.ok(Math.abs(dt.target.price - 90) < 1.5, 'neckline 105 less the 15 between the tops and the neckline');
  const failed = find(path([[0, 100], [15, 120], [30, 105], [45, 120], [52, 115], [62, 130], [75, 135]]), 'Double Top');
  assert.equal(failed.status, 'Failed');
  assert.equal(failed.target, null);
});

test('flag and pennant targets are the pole', () => {
  const flag = find(path(BEAR_FLAG), 'Bearish Flag');
  // the pole is 140 to 110 = 30; the channel's lower line is about 115 where the close breaks it
  assert.ok(flag.target.price > 80 && flag.target.price < 90, `a pole below the break, got ${flag.target.price}`);
  const pen = find(path(BEAR_PENNANT), 'Bearish Pennant');
  assert.ok(pen.target.price > 78 && pen.target.price < 92, `got ${pen.target.price}`);
});

test('the Patterns and Price Targets inputs filter what is drawn', () => {
  const list = [
    { type: 'A', status: 'Awaiting', points: [{ i: 10 }], target: { price: 1 } },
    { type: 'B', status: 'Reached', points: [{ i: 20 }], target: { price: 2 } },
    { type: 'C', status: 'Failed', points: [{ i: 30 }], target: null },
    { type: 'D', status: 'Awaiting', points: [{ i: 40 }], target: { price: 3 } },
  ];
  const names = (o) => filter(list, o).map((p) => p.type).join('');
  assert.equal(names({}), 'ABCD');
  assert.equal(names({ patterns: 'Awaiting and Reached' }), 'ABD');
  assert.equal(names({ patterns: 'Only Awaiting' }), 'AD');
  assert.equal(names({ patterns: 'Last Awaiting' }), 'D');
  assert.deepEqual(filter(list, { targets: 'None' }).map((p) => p.target), [null, null, null, null]);
  assert.deepEqual(filter(list, { targets: 'Only Awaiting' }).map((p) => !!p.target), [true, false, false, true]);
  assert.deepEqual(filter(list, { targets: 'Awaiting and Reached' }).map((p) => !!p.target), [true, true, false, true]);
});

test('In Progress finds a pattern that is still forming, and nothing without it', () => {
  const part = path(DOUBLE_TOP).slice(0, 49); // the second top at bar 45 is not confirmed until bar 50
  assert.ok(!types(part).includes('Double Top'));
  const prog = find(part, 'Double Top', { inProgress: true });
  assert.ok(prog, 'found with In Progress on');
  assert.equal(prog.status, 'In progress');
  assert.equal(prog.target, null);
});

test('short or flat series give nothing and do not throw', () => {
  assert.deepEqual(detect([]), []);
  assert.deepEqual(detect(path([[0, 100], [8, 101]])), []);
  assert.deepEqual(detect(path([[0, 100], [200, 100]])), []);
});

test('each pattern reports its entry (where it broke) and its stop (where it is wrong)', () => {
  const dt = find(path(DOUBLE_TOP), 'Double Top');
  assert.ok(Math.abs(dt.entry - 105) < 0.5, `the neckline, got ${dt.entry}`);
  assert.ok(dt.stop > 119 && dt.stop < 122, `the top, got ${dt.stop}`);
  const up = find(path(mirror(DOUBLE_TOP)), 'Double Bottom');
  assert.ok(Math.abs(up.entry - 115) < 0.5 && up.stop < 101 && up.stop > 98, `entry ${up.entry}, stop ${up.stop}`);
  const hs = find(path(HEAD_SHOULDERS), 'Head And Shoulders');
  assert.ok(hs.stop > 124 && hs.stop < 127, 'the head');
  const tri = find(path(TRIANGLE), 'Triangle');
  assert.equal(tri.dir, 'bull');
  assert.ok(tri.stop < tri.entry, 'a bull break of a triangle is wrong below its lower line');
  const forming = find(path(DOUBLE_TOP).slice(0, 49), 'Double Top', { inProgress: true });
  assert.equal(forming.entry, null);
});
