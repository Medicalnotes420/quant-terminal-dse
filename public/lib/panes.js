// Lower-pane bookkeeping for a chart, free of the DOM so node can test it.
// `groups` is one array of indicator uids per lower pane (pane 1, 2, ...), the pane's own indicator first
// and any indicator built on it after. The chart records it while it draws.

// Swap lower pane `index` with its neighbour (dir -1 up, +1 down). The draw order of indicators in the array
// decides the pane order, so the array is what changes; indicators on the price pane or hidden keep their place.
export function reorder(indicators, groups, index, dir) {
  const j = index + dir;
  if (!Number.isInteger(index) || index < 0 || index >= groups.length || j < 0 || j >= groups.length) return indicators;
  const g = groups.map((x) => [...x]);
  [g[index], g[j]] = [g[j], g[index]];
  const inGroup = new Set(g.flat());
  const byUid = new Map(indicators.map((x) => [x.uid, x]));
  return [...indicators.filter((x) => !inGroup.has(x.uid)), ...g.flat().map((u) => byUid.get(u)).filter(Boolean)];
}

// Delete a lower pane with everything built on it, so no indicator is left pointing at a missing source.
export function withoutGroup(indicators, groups, index) {
  const drop = new Set(groups[index] || []);
  return indicators.filter((x) => !drop.has(x.uid));
}

export const groupOf = (groups, uid) => groups.findIndex((g) => g.includes(uid));

// A chart layout holds 1, 2, 3, 4, 6, 8 or 16 charts: closing one is only offered when what remains fits one.
export const canClose = (count) => [1, 2, 3, 4, 6, 8, 16].includes(count - 1) && count > 1;
