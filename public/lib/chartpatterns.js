// All Chart Patterns, after TradingView's indicator of that name:
// https://www.tradingview.com/support/solutions/43000706927/ and the pages for each pattern.
//
// 16 patterns, found from 5/5 pivots (a high with no higher high 5 bars on either side) in the last 600 bars, with the
// breakout fixed by a close. Targets are the measured moves TradingView describes: the pole for flags and pennants, the
// height of the figure for the rest. TradingView does not publish its tolerances, so the numbers in CONFIG are this
// code's own: they decide what counts as "at the same level", "flat" or "a pole".
//
// How it works: one pass over the bars, so a pattern found on bars[0..k] is found the same way on the whole series
// (nothing repaints, only its status moves on). Only patterns that break DOWN are written; the up versions are the same
// code run on the price-flipped series and renamed. Triangle and rectangle break either way and run once.

export const CONFIG = {
  pivot: 5, // bars each side of a pivot
  lookback: 600, // a pattern must start within this many bars of the last one
  equalTol: 0.03, // tops or bottoms within 3% of each other are "the same level"
  minDepth: 0.03, // a valley between two tops is at least 3% below them
  shoulderTol: 0.08, // head and shoulders: the shoulders within 8% of each other
  headMin: 0.02, // ... and the head at least 2% above the higher shoulder
  flat: 0.0004, // a line moving less than 0.04% of price per bar is flat
  parallelTol: 0.0006, // flag lines closer than this in slope are parallel
  converge: 0.85, // a wedge, triangle or pennant ends at most this fraction of its starting width
  touchTol: 0.015, // the middle pivot sits within 1.5% of the line through the end pivots
  breakTol: 0.005, // a close this far past a pattern's top or stop line counts as past it
  insideTol: 0.015, // closes inside a figure may poke out of its lines by 1.5%
  minRect: 0.03, // a rectangle is at least 3% tall
  minTri: 0.03, // a triangle starts at least 3% wide
  poleMin: 0.1, // a flagpole is a move of at least 10% ...
  poleBars: 30, // ... in at most 30 bars
  retraceMax: 0.5, // the flag gives back at most half the pole
  cupMinDepth: 0.05, cupMinBars: 20, cupMaxBars: 200, cupRimTol: 0.06, cupU: 0.68, cupWobble: 0.35, handleMax: 0.5,
};

// the most specific reading of a set of pivots wins; a pole makes a flag more specific than the double top inside it
const PRIO = { hs: 9, triple: 8, flag: 7.5, cup: 7.4, double: 7, wedge: 4, tri: 3, rect: 3 };
// the up version of each down-breaking pattern
const FLIP = {
  "Double Top": "Double Bottom", "Triple Top": "Triple Bottom", "Head And Shoulders": "Inverse Head And Shoulders",
  "Rising Wedge": "Falling Wedge", "Bearish Flag": "Bullish Flag", "Bearish Pennant": "Bullish Pennant",
  "Inverted Cup and Handle": "Cup and Handle",
};
export const PATTERNS = [...Object.keys(FLIP), ...Object.values(FLIP), "Triangle", "Rectangle"];

const pt = (p) => ({ i: p.i, price: p.price });
const line = (a, b) => {
  const m = (b.price - a.price) / (b.i - a.i);
  return { a: pt(a), b: pt(b), m, at: (i) => a.price + m * (i - a.i) };
};
// The flipped series has negative prices, so every tolerance is taken from the size of the price, never its sign.
const above = (x, f) => x + Math.abs(x) * f;
const below = (x, f) => x - Math.abs(x) * f;
const rel = (m, price) => m / Math.abs(price); // slope as a fraction of price per bar

// New bars with every price negated and high and low swapped: a down pattern becomes the up pattern.
const flipBars = (bars) => bars.map((b) => ({ ...b, open: -b.open, high: -b.low, low: -b.high, close: -b.close }));

// ---------- pivots, one confirmed pivot at a time ----------
function* pivotEvents(bars, k) {
  const list = []; // alternating H and L; the last one can still be replaced by a more extreme one of its type
  for (let c = 2 * k; c < bars.length; c++) {
    const i = c - k;
    let hi = true, lo = true;
    for (let j = i - k; j <= i + k && (hi || lo); j++) {
      if (j === i) continue;
      if (bars[j].high > bars[i].high || (j < i && bars[j].high === bars[i].high)) hi = false;
      if (bars[j].low < bars[i].low || (j < i && bars[j].low === bars[i].low)) lo = false;
    }
    const last = list.at(-1);
    // an outside bar is both: take the one that alternates
    const type = hi && lo ? (last?.type === "H" ? "L" : "H") : hi ? "H" : lo ? "L" : null;
    if (!type) continue;
    const ev = { i, type, price: type === "H" ? bars[i].high : bars[i].low, at: c };
    if (!last || last.type !== type) list.push(ev);
    else if (type === "H" ? ev.price > last.price : ev.price < last.price) list[list.length - 1] = ev;
    else continue;
    yield { list, at: c };
  }
}

const maxClose = (bars, a, b) => { let m = -Infinity; for (let i = a; i <= b; i++) m = Math.max(m, bars[i].close); return m; };
const minClose = (bars, a, b) => { let m = Infinity; for (let i = a; i <= b; i++) m = Math.min(m, bars[i].close); return m; };
const typesAre = (P, s) => P.length === s.length && P.every((p, j) => p.type === s[j]);
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

// ---------- the matchers: each gets the newest pivots and returns raw patterns that break down ----------
// raw: { type, prio, dir: "bear" | "either", pivots, lines, boundary(i), stop(i), invalid, target(boundaryPrice, i), start, shape: [points to join] }

function doubleTop(P, bars, C) {
  const t = P.slice(-3);
  if (!typesAre(t, "HLH")) return [];
  const [a, b, c] = t, top = Math.max(a.price, c.price);
  if (!near(a.price, c.price, C.equalTol) || (Math.min(a.price, c.price) - b.price) / Math.abs(Math.min(a.price, c.price)) < C.minDepth) return [];
  if (maxClose(bars, a.i, c.i) > above(top, C.equalTol)) return [];
  const avg = (a.price + c.price) / 2;
  return [{ type: "Double Top", prio: PRIO.double, dir: "bear", pivots: t, shape: t, lines: [{ ...line(b, { i: c.i, price: b.price }), kind: "neck" }],
    boundary: () => b.price, invalid: top, target: (nb) => nb - (avg - b.price), start: a.i }];
}

function tripleTop(P, bars, C) {
  const t = P.slice(-5);
  if (!typesAre(t, "HLHLH")) return [];
  const [h1, l1, h2, l2, h3] = t, hs = [h1.price, h2.price, h3.price], top = Math.max(...hs), low = Math.min(l1.price, l2.price);
  if (Math.min(...hs) < below(top, C.equalTol) || (Math.min(...hs) - Math.max(l1.price, l2.price)) / Math.abs(Math.min(...hs)) < C.minDepth) return [];
  if (maxClose(bars, h1.i, h3.i) > above(top, C.equalTol)) return [];
  const avg = (hs[0] + hs[1] + hs[2]) / 3;
  return [{ type: "Triple Top", prio: PRIO.triple, dir: "bear", pivots: t, shape: t, lines: [{ ...line({ i: h1.i, price: low }, { i: h3.i, price: low }), kind: "neck" }],
    boundary: () => low, invalid: top, target: (nb) => nb - (avg - low), start: h1.i }];
}

function headShoulders(P, bars, C) {
  const t = P.slice(-5);
  if (!typesAre(t, "HLHLH")) return [];
  const [s1, l1, hd, l2, s2] = t;
  if (!near(s1.price, s2.price, C.shoulderTol) || hd.price < above(Math.max(s1.price, s2.price), C.headMin)) return [];
  if (maxClose(bars, s1.i, s2.i) > above(hd.price, C.breakTol)) return [];
  const neck = line(l1, l2);
  const depth = hd.price - neck.at(hd.i);
  if (depth <= 0 || depth / Math.abs(hd.price) < C.minDepth) return [];
  return [{ type: "Head And Shoulders", prio: PRIO.hs, dir: "bear", pivots: t, shape: t, lines: [{ ...line({ i: l1.i, price: neck.at(l1.i) }, { i: s2.i, price: neck.at(s2.i) }), kind: "neck" }],
    boundary: (i) => neck.at(i), invalid: hd.price, target: (nb, i) => nb - depth, start: s1.i }];
}

// two lines through the last five pivots: upper through the highs, lower through the lows
function channel(P) {
  const t = P.slice(-5);
  if (t.length < 5) return null;
  const hs = t.filter((p) => p.type === "H"), ls = t.filter((p) => p.type === "L");
  return { t, hs, ls, up: line(hs[0], hs.at(-1)), lo: line(ls[0], ls.at(-1)) };
}
// the middle pivot of the three on one line lies near it, and closes stay between the lines
function figureOk(ch, bars, C) {
  const { t, hs, ls, up, lo } = ch;
  const mid = hs.length === 3 ? [hs[1], up] : [ls[1], lo];
  if (!near(mid[0].price, mid[1].at(mid[0].i), C.touchTol)) return false;
  for (let i = t[0].i; i <= t.at(-1).i; i++)
    if (bars[i].close > above(up.at(i), C.insideTol) || bars[i].close < below(lo.at(i), C.insideTol)) return false;
  return up.b.i > up.a.i && lo.b.i > lo.a.i;
}

function risingWedge(P, bars, C) {
  const ch = channel(P);
  if (!ch || !figureOk(ch, bars, C)) return [];
  const { t, up, lo } = ch, avg = (t[0].price + t.at(-1).price) / 2;
  const su = rel(up.m, avg), sl = rel(lo.m, avg), w0 = up.at(t[0].i) - lo.at(t[0].i), w1 = up.at(t.at(-1).i) - lo.at(t.at(-1).i);
  if (su <= C.flat || sl <= C.flat || w0 <= 0 || w1 / w0 > C.converge) return [];
  return [{ type: "Rising Wedge", prio: PRIO.wedge, dir: "bear", pivots: t, shape: t, lines: [{ a: { i: t[0].i, price: up.at(t[0].i) }, b: { i: t.at(-1).i, price: up.at(t.at(-1).i) }, kind: "upper" }, { a: { i: t[0].i, price: lo.at(t[0].i) }, b: { i: t.at(-1).i, price: lo.at(t.at(-1).i) }, kind: "lower" }],
    boundary: (i) => lo.at(i), stop: (i) => up.at(i), invalid: Math.max(...t.map((p) => p.price)), target: (nb) => nb - w0, start: t[0].i }];
}

function triangleRect(P, bars, C) {
  const ch = channel(P);
  if (!ch || !figureOk(ch, bars, C)) return [];
  const { t, up, lo } = ch, avg = (t[0].price + t.at(-1).price) / 2;
  const su = rel(up.m, avg), sl = rel(lo.m, avg), w0 = up.at(t[0].i) - lo.at(t[0].i), w1 = up.at(t.at(-1).i) - lo.at(t.at(-1).i);
  const lines = [{ a: { i: t[0].i, price: up.at(t[0].i) }, b: { i: t.at(-1).i, price: up.at(t.at(-1).i) }, kind: "upper" }, { a: { i: t[0].i, price: lo.at(t[0].i) }, b: { i: t.at(-1).i, price: lo.at(t.at(-1).i) }, kind: "lower" }];
  const base = { dir: "either", pivots: t, shape: t, lines, upper: (i) => up.at(i), lower: (i) => lo.at(i), height: w0, start: t[0].i };
  if (w0 <= 0) return [];
  if (Math.abs(su) <= C.flat && Math.abs(sl) <= C.flat) {
    return w0 / avg >= C.minRect ? [{ ...base, type: "Rectangle", prio: PRIO.rect }] : [];
  }
  const wedgeLike = (su > C.flat && sl > C.flat) || (su < -C.flat && sl < -C.flat);
  if (wedgeLike || w1 / w0 > C.converge || w0 / avg < C.minTri) return [];
  return [{ ...base, type: "Triangle", prio: PRIO.tri }];
}

// a pole (the move into the figure) and a channel of four pivots after it: flag when parallel, pennant when converging
function bearFlag(P, bars, C) {
  const t = P.slice(-5);
  if (!typesAre(t, "HLHLH")) return [];
  const [p0, p1, p2, p3, p4] = t, pole = p0.price - p1.price;
  if (pole / Math.abs(p0.price) < C.poleMin || p1.i - p0.i > C.poleBars || p4.i - p1.i > 2 * (p1.i - p0.i) + 10) return [];
  if (Math.max(p2.price, p4.price) - p1.price > C.retraceMax * pole) return [];
  const up = line(p2, p4), lo = line(p1, p3), avg = (p1.price + p4.price) / 2;
  const su = rel(up.m, avg), sl = rel(lo.m, avg), w0 = up.at(p1.i) - lo.at(p1.i), w1 = up.at(p4.i) - lo.at(p4.i);
  for (let i = p1.i; i <= p4.i; i++) if (bars[i].close > above(up.at(i), C.insideTol) || bars[i].close < below(lo.at(i), C.insideTol)) return [];
  const converging = w0 > 0 && w1 / w0 <= C.converge, parallel = Math.abs(su - sl) <= C.parallelTol && su >= -C.flat;
  if (!converging && !parallel) return [];
  const lines = [{ a: { i: p1.i, price: up.at(p1.i) }, b: { i: p4.i, price: up.at(p4.i) }, kind: "upper" }, { a: pt(p1), b: { i: p4.i, price: lo.at(p4.i) }, kind: "lower" }];
  return [{ type: converging ? "Bearish Pennant" : "Bearish Flag", prio: PRIO.flag, dir: "bear", pivots: t, shape: t, lines,
    boundary: (i) => lo.at(i), stop: (i) => up.at(i), invalid: p0.price, target: (nb) => nb - pole, start: p0.i }];
}

// an upside-down cup: two lows at the same level with a dome between them, then a small bounce (the handle)
function invertedCup(P, bars, C) {
  const n = P.length;
  if (n < 3 || P[n - 1].type !== "H" || P[n - 2].type !== "L") return [];
  const handle = P[n - 1], r = P[n - 2];
  for (let k = n - 3; k >= 0; k--) {
    const l = P[k];
    if (l.type !== "L") continue;
    const span = r.i - l.i;
    if (span > C.cupMaxBars) break;
    if (span < C.cupMinBars || !near(l.price, r.price, C.cupRimTol)) continue;
    const rim = Math.min(l.price, r.price);
    let top = -Infinity, topI = l.i;
    for (let i = l.i; i <= r.i; i++) if (bars[i].high > top) { top = bars[i].high; topI = i; }
    const depth = top - (l.price + r.price) / 2;
    if (depth / Math.abs(top) < C.cupMinDepth || topI < l.i + 0.25 * span || topI > l.i + 0.75 * span) continue;
    if (minClose(bars, l.i, r.i) < below(rim, C.breakTol)) continue;
    // a dome, not a tent: at a quarter and three quarters across, the price is most of the way up to the top
    const q = (x) => (bars[Math.round(l.i + x * span)].close - rim) / (top - rim);
    if ((q(0.25) + q(0.75)) / 2 < C.cupU) continue;
    // one dome, not two: climbing to the top it never gives back more than a third of the depth, and neither coming down
    let run = bars[l.i].close, wobble = false;
    for (let i = l.i; i <= topI && !wobble; i++) { run = Math.max(run, bars[i].close); wobble = run - bars[i].close > C.cupWobble * depth; }
    run = bars[topI].close;
    for (let i = topI; i <= r.i && !wobble; i++) { run = Math.min(run, bars[i].close); wobble = bars[i].close - run > C.cupWobble * depth; }
    if (wobble) continue;
    if (handle.price - r.price > C.handleMax * depth || handle.price <= r.price) continue;
    return [{ type: "Inverted Cup and Handle", prio: PRIO.cup, dir: "bear", pivots: [l, r, handle], shape: [l, { i: topI, price: top }, r, handle], lines: [],
      boundary: () => r.price, invalid: top, target: (nb) => nb - depth, start: l.i }];
  }
  return [];
}

const DOWN = [headShoulders, tripleTop, doubleTop, invertedCup, bearFlag, risingWedge];

// ---------- what happens to a pattern after it forms ----------
// Awaiting: no target yet. Reached: the target was touched after a close beyond the boundary. Failed: a close beyond
// the pattern's extreme before that. Breakouts and targets use the bars after the last pivot.
function settle(raw, bars) {
  const out = { status: "Awaiting", breakI: null, dir: raw.dir, target: null };
  const from = raw.pivots.at(-1).i + 1;
  for (let i = from; i < bars.length; i++) {
    const c = bars[i].close;
    if (out.breakI == null) {
      if (raw.dir === "either") {
        const up = c > raw.upper(i), dn = c < raw.lower(i);
        if (up || dn) { out.breakI = i; out.dir = up ? "bull" : "bear"; out.level = up ? raw.upper(i) : raw.lower(i); }
      } else if (c < raw.boundary(i)) { out.breakI = i; out.level = raw.boundary(i); }
      else if (raw.stop ? c > above(raw.stop(i), CONFIG.breakTol) : c > raw.invalid) { out.status = "Failed"; out.failI = i; return out; }
      if (out.breakI != null) out.target = raw.dir === "either" ? out.level + (out.dir === "bull" ? raw.height : -raw.height) : raw.target(out.level, i);
      continue;
    }
    const bull = out.dir === "bull";
    if (bull ? bars[i].high >= out.target : bars[i].low <= out.target) { out.status = "Reached"; out.reachI = i; return out; }
    if (raw.dir !== "either" && c > raw.invalid) { out.status = "Failed"; out.failI = i; return out; }
  }
  return out;
}

// ---------- one pass in one orientation ----------
function scan(bars, C, { includeNeutral, inProgress }) {
  const found = [], seen = new Set();
  const matchers = includeNeutral ? [...DOWN, triangleRect] : DOWN;
  const add = (P, at, provisional) => {
    for (const m of matchers)
      for (const raw of m(P, bars, C)) {
        const key = `${raw.type}|${raw.pivots.map((p) => p.i).join(",")}`;
        if (seen.has(key)) continue;
        if (provisional && raw.pivots.at(-1) !== P.at(-1)) continue; // an emerging pattern must use the running leg
        seen.add(key);
        // settled here, in this orientation's own bars, before any flip back
        found.push({ ...raw, formedAt: at, inProgress: !!provisional, s: provisional ? { status: "In progress", breakI: null, dir: raw.dir, target: null } : settle(raw, bars) });
      }
  };
  let last = null;
  for (const ev of pivotEvents(bars, C.pivot)) {
    last = ev.list;
    add(ev.list.slice(-30), ev.at, false); // a cup can hold many pivots; the rest use the last five
  }
  if (inProgress && last?.length) {
    const lp = last.at(-1), type = lp.type === "H" ? "L" : "H";
    let best = null;
    for (let i = lp.i + 1; i < bars.length; i++) {
      const price = type === "H" ? bars[i].high : bars[i].low;
      if (!best || (type === "H" ? price > best.price : price < best.price)) best = { i, type, price };
    }
    if (best) add([...last.slice(-29), best], bars.length - 1, true);
  }
  return found;
}

// Map a down-pattern found on flipped bars back to the real series: the up version, prices negated.
function unflip(p) {
  const neg = (x) => ({ i: x.i, price: -x.price });
  return {
    ...p, type: FLIP[p.type] || p.type, pivots: p.pivots.map(neg), shape: p.shape.map(neg),
    lines: p.lines.map((l) => ({ ...l, a: neg(l.a), b: neg(l.b) })),
    s: { ...p.s, dir: p.s.dir === "bear" ? "bull" : p.s.dir, target: p.s.target == null ? null : -p.s.target },
  };
}

// Several patterns can read the same pivots. The most specific wins: a pattern whose pivots all sit inside a stronger
// one is dropped (the double top inside a triple top), and so is a same-type pattern sliding along by one pivot. A
// rectangle and a triple top can be the same five pivots: both are kept, one says "flat range", the other "reversal".
function dedupe(list) {
  const kept = [];
  const rectTriple = (a, b) => (a.type === "Rectangle") !== (b.type === "Rectangle") && /Triple/.test(a.type + b.type);
  for (const p of [...list].sort((a, b) => b.prio - a.prio || a.formedAt - b.formedAt)) {
    const ids = new Set(p.pivots.map((x) => x.i));
    const clash = kept.some((k) => {
      if (rectTriple(p, k)) return false;
      const shared = k.pivots.filter((x) => ids.has(x.i)).length;
      return shared === Math.min(k.pivots.length, p.pivots.length) || (k.type === p.type && shared >= 3);
    });
    if (!clash) kept.push(p);
  }
  return kept;
}

/**
 * Find the patterns in `bars` ({time, open, high, low, close}).
 * opts: patterns "All" | "Awaiting and Reached" | "Only Awaiting" | "Last Awaiting"; targets "All" | "Only Awaiting" |
 * "Awaiting and Reached" | "None"; inProgress true to look for emerging patterns too.
 * Returns [{ type, dir, status, points, lines, breakI, target: {price, fromI, toI} | null, formedAt, inProgress }].
 */
export function detect(bars, opts = {}, config = CONFIG) {
  const C = { ...CONFIG, ...config };
  const n = bars.length;
  if (n < 4 * C.pivot) return [];
  const first = n - C.lookback;
  const flipped = flipBars(bars);
  const all = [
    ...scan(bars, C, { includeNeutral: true, inProgress: !!opts.inProgress }),
    ...scan(flipBars(bars), C, { includeNeutral: false, inProgress: !!opts.inProgress }).map(unflip),
  ].filter((p) => p.start >= first);
  const out = dedupe(all).map((p) => {
    const s = p.s, end = s.reachI ?? s.failI ?? s.breakI ?? p.pivots.at(-1).i;
    return {
      type: p.type, dir: s.dir, status: s.status, points: p.shape.map(pt), lines: p.lines, breakI: s.breakI, formedAt: p.formedAt, inProgress: p.inProgress,
      target: s.target == null ? null : { price: s.target, fromI: s.breakI, toI: Math.min(n - 1, Math.max(end, s.breakI) + 10) },
    };
  }).sort((a, b) => a.points[0].i - b.points[0].i);
  return filter(out, opts);
}

export function filter(list, opts = {}) {
  const mode = opts.patterns || "All", targets = opts.targets || "All";
  let shown = list;
  if (mode === "Only Awaiting") shown = list.filter((p) => p.status === "Awaiting" || p.status === "In progress");
  else if (mode === "Awaiting and Reached") shown = list.filter((p) => p.status !== "Failed");
  else if (mode === "Last Awaiting") {
    const aw = list.filter((p) => p.status === "Awaiting");
    const best = aw.reduce((a, p) => (!a || p.points[0].i > a.points[0].i ? p : a), null);
    shown = list.filter((p) => p === best || p.status === "In progress");
  }
  return shown.map((p) => {
    const keep = targets === "None" ? false : targets === "Only Awaiting" ? p.status === "Awaiting" : targets === "Awaiting and Reached" ? p.status === "Awaiting" || p.status === "Reached" : true;
    return keep ? p : { ...p, target: null };
  });
}
