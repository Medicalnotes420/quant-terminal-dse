import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChartPatterns, distToSegment, patternColour } from '../public/js/chart-patterns.js';

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
