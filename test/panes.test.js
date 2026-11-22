import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorder, withoutGroup, groupOf, canClose } from '../public/lib/panes.js';

const ind = (uid, extra = {}) => ({ uid, id: 'x', params: {}, ...extra });
// uid o is an overlay, h is hidden (no pane), r and m are panes, c is built on r
const list = [ind('o'), ind('h', { hidden: true }), ind('r'), ind('m'), ind('c', { params: { source: 'ind:r' } })];
const groups = [['r', 'c'], ['m']];

test('moving a pane swaps it with its neighbour and keeps overlays and hidden ones', () => {
  const out = reorder(list, groups, 0, +1);
  assert.deepEqual(out.map((x) => x.uid), ['o', 'h', 'm', 'r', 'c']);
  assert.deepEqual(reorder(list, groups, 1, -1).map((x) => x.uid), ['o', 'h', 'm', 'r', 'c']);
});

test('moving past either end changes nothing', () => {
  assert.equal(reorder(list, groups, 0, -1), list);
  assert.equal(reorder(list, groups, 1, +1), list);
  assert.equal(reorder(list, groups, 5, -1), list);
});

test('deleting a pane takes the indicator built on it too', () => {
  assert.deepEqual(withoutGroup(list, groups, 0).map((x) => x.uid), ['o', 'h', 'm']);
  assert.deepEqual(withoutGroup(list, groups, 1).map((x) => x.uid), ['o', 'h', 'r', 'c']);
  assert.equal(withoutGroup(list, groups, 9).length, list.length);
});

test('a pane is found by any uid in its group, and -1 when it has none', () => {
  assert.equal(groupOf(groups, 'c'), 0);
  assert.equal(groupOf(groups, 'm'), 1);
  assert.equal(groupOf(groups, 'h'), -1);
});

test('closing a chart is offered only when the rest fits a layout', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 16].map(canClose), [false, true, true, true, true, false, true, false, true, false]);
});
