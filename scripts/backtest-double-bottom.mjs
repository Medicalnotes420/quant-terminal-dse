// A closer look at one pattern alone. The default is Double Bottom, the one that showed a signal in scripts/backtest-patterns.mjs;
// pass another name, such as "Triangle" or "Triple Bottom", as the first argument.
//
//   node scripts/backtest-double-bottom.mjs [pattern]   writes docs/<pattern>-backtest.html and .json
//
// Read this first: Double Bottom was picked because it looked best in the all-patterns run, on this same data. That makes
// every number here friendlier than a fresh test would give. Nothing below is tuned: the variants are a fixed list that
// changes how the trade is filled and costed, never which trades are taken (except the "liquid" cut, set in advance).
//
// Trade rules are those of the all-patterns run: a Double Bottom that broke out, was already known by then, entered long,
// exiting at the pattern's stop or target or after 60 bars, nothing sold in the first 2 bars (T+2), stop first when a bar
// touches both, gaps fill at the open. New here: entering at the NEXT open (what you can actually do after seeing the
// close), bigger costs, a month-by-month and year-by-year view, a portfolio run, and splits by size, liquidity and market.
process.env.QT_DSE_WORKER = "off";
process.env.QT_OFFLINE = "1";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect } from "../public/lib/chartpatterns.js";
import * as dse from "../lib/dse.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const A2 = "../../Stockapp/data/raw/a2/x/Dhaka Stock Exchange End-of-Day Financial Dataset";
const HOLD = 60, TPLUS = 2, LIQUID = 5e6, CONTROL = 20, HOLDOUT = Date.UTC(2026, 0, 25) / 1000, TYPE = process.argv[2] || "Double Bottom", SLUG = TYPE.toLowerCase().replace(/[^a-z]+/g, "-"), WINNER = TYPE === "Double Bottom"; // node scripts/backtest-double-bottom.mjs "Triple Bottom"
const csv = (f) => fs.readFileSync(f, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
const equities = csv(`${A2}/metadata/company_metadata.csv`).filter((r) => r[1] === "Equity").map((r) => r[0].trim());
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 10);

async function fullSeries(t) {
  const adj = `${A2}/Company Separated Adjusted Data/${t}.csv`, raw = `${A2}/Company Separated UnAdjusted Data/${t}.csv`;
  if (!fs.existsSync(adj)) return null;
  const traded = new Map(fs.existsSync(raw) ? csv(raw).map((r) => [r[0], +r[4] * +r[5]]) : []);
  let bars = csv(adj).map(([d, o, h, l, c, v]) => ({ time: Date.parse(d) / 1000, open: +o, high: +h, low: +l, close: +c, volume: +v, val: traded.get(d) ?? +c * +v }));
  const lastA2 = bars.at(-1)?.time ?? 0;
  try {
    const more = (await dse.candles(t, "1D", 1e9, { adjusted: true })).candles.filter((b) => b.time > lastA2 && b.volume > 0);
    bars = bars.concat(more.map((b) => ({ ...b, val: b.close * b.volume })));
  } catch { /* not in the 2026 files */ }
  bars = bars.filter((b) => b.volume > 0 && b.high >= b.low && b.close > 0);
  return bars.length >= 250 ? bars : null;
}

// The market: DSEX closes, with its 200-day average, to say whether the market was rising when a trade began.
const dsex = csv(`${A2}/Company Separated UnAdjusted Data/00DSEX.csv`).map((r) => ({ time: Date.parse(r[0]) / 1000, close: +r[4] }));
try {
  const more = (await dse.candles("DSEX", "1D", 1e9)).candles.filter((b) => b.time > dsex.at(-1).time);
  dsex.push(...more.map((b) => ({ time: b.time, close: b.close })));
} catch { /* none */ }
const dsexAt = (time) => { // last index at or before `time`
  let lo = 0, hi = dsex.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dsex[m].time <= time) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
};
const bullMarket = (time) => {
  const i = dsexAt(time);
  if (i < 200) return null;
  let s = 0; for (let k = i - 199; k <= i; k++) s += dsex[k].close;
  return dsex[i].close > s / 200;
};

// ---------- one trade ----------
// Bought at bar `e` at price `entry`; sold from bar e + TPLUS at the stop or target, or at the close HOLD bars on.
function simulate(bars, e, entry, stop, target, cost) {
  const last = Math.min(bars.length - 1, e + HOLD);
  for (let j = e + TPLUS; j <= last; j++) {
    const b = bars[j];
    let px = null, reason = null;
    if (b.open <= stop) [px, reason] = [b.open, "stop"];
    else if (b.low <= stop) [px, reason] = [stop, "stop"];
    else if (b.open >= target) [px, reason] = [b.open, "target"];
    else if (b.high >= target) [px, reason] = [target, "target"];
    if (px != null) return fin(px, reason, j);
  }
  return fin(bars[last].close, "time", last);
  function fin(px, reason, j) {
    return { net: (px * (1 - cost)) / (entry * (1 + cost)) - 1, reason, hold: j - e, exitTime: bars[j].time };
  }
}
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

// The fixed list of ways to fill and cost the same trades.
const VARIANTS = [
  { id: "close", label: "Buy at the breakout close, 0.30% each way", next: false, cost: 0.003 },
  { id: "open", label: "Buy at the next open, 0.30% each way", next: true, cost: 0.003 },
  { id: "open8", label: "Next open, 0.80% each way (0.5% slippage)", next: true, cost: 0.008 },
  { id: "open13", label: "Next open, 1.30% each way (1% slippage)", next: true, cost: 0.013 },
];

// ---------- run ----------
const trades = [];
let shares = 0, patterns = 0;
for (const [k, t] of equities.entries()) {
  const bars = await fullSeries(t);
  if (!bars) continue;
  shares++;
  const r = rng(5000 + k);
  const list = detect(bars, {}, { lookback: 1e9 }).filter((p) => p.type === TYPE);
  patterns += list.length;
  for (const p of list) {
    if (p.breakI == null || p.breakI < p.formedAt || !p.target || p.stop == null || p.dir !== "bull") continue;
    const i = p.breakI, stop = p.stop, target = p.target.price;
    if (bars[i].high === bars[i].low || i + 1 >= bars.length) continue;
    const prev = bars[i - 1]?.close, locked = prev > 0 && bars[i].close === bars[i].high && bars[i].close / prev - 1 >= 0.08;
    const liquid = median(bars.slice(Math.max(0, i - 19), i + 1).map((b) => b.val)) >= LIQUID;
    const rec = { t, time: bars[i].time, liquid, locked, size: (target - bars[i].close) / bars[i].close, turnover: median(bars.slice(Math.max(0, i - 19), i + 1).map((b) => b.val)), bull: bullMarket(bars[i].time), v: {} };
    for (const v of VARIANTS) {
      const e = v.next ? i + 1 : i, entry = v.next ? bars[i + 1].open : bars[i].close;
      if (!(stop < entry && entry < target)) { rec.v[v.id] = null; continue; } // already past the stop or the target
      const risk = (entry - stop) / entry, reward = (target - entry) / entry;
      const res = simulate(bars, e, entry, stop, target, v.cost), ctl = [];
      for (let n = 0, tries = 0; n < CONTROL && tries < CONTROL * 5; tries++) {
        const j = 40 + Math.floor(r() * (bars.length - 40 - HOLD - 2)), ce = v.next ? bars[j + 1].open : bars[j].close;
        if (!(ce > 0)) continue; // a bar with no opening price
        n++;
        ctl.push(simulate(bars, v.next ? j + 1 : j, ce, ce * (1 - risk), ce * (1 + reward), v.cost).net);
      }
      rec.v[v.id] = { ...res, control: mean(ctl), risk, reward, entryTime: bars[e].time };
    }
    trades.push(rec);
  }
}

// ---------- statistics ----------
function cluster(rows, f, keyOf, seed = 11) {
  const by = new Map();
  for (const x of rows) { const k = keyOf(x); (by.get(k) ?? by.set(k, []).get(k)).push(f(x)); }
  const groups = [...by.values()], r = rng(seed), out = [];
  if (groups.length < 5) return [NaN, NaN];
  for (let n = 0; n < 1500; n++) {
    let s = 0, c = 0;
    for (let g = 0; g < groups.length; g++) for (const x of groups[Math.floor(r() * groups.length)]) { s += x; c++; }
    out.push(s / c);
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
}
function stats(rows, vid) {
  const x = rows.filter((r) => r.v[vid]);
  const d = (r) => r.v[vid].net - r.v[vid].control;
  const a = cluster(x, d, (r) => r.t), b = cluster(x, d, (r) => iso(r.time).slice(0, 7));
  const share = (reason) => (x.length ? x.filter((r) => r.v[vid].reason === reason).length / x.length : NaN);
  return {
    n: x.length, shares: new Set(x.map((r) => r.t)).size, target: share("target"), stop: share("stop"), time: share("time"),
    net: mean(x.map((r) => r.v[vid].net)), median: median(x.map((r) => r.v[vid].net)), control: mean(x.map((r) => r.v[vid].control)),
    edge: mean(x.map(d)), lo: Math.min(a[0], b[0]), hi: Math.max(a[1], b[1]), hold: mean(x.map((r) => r.v[vid].hold)),
    win: x.length ? x.filter((r) => r.v[vid].net > 0).length / x.length : NaN,
  };
}
const liq = trades.filter((r) => r.liquid), year = (r) => +iso(r.time).slice(0, 4);
const variantTable = VARIANTS.map((v) => ({ ...v, all: stats(trades, v.id), liquid: stats(liq, v.id) }));
const years = [...new Set(liq.map(year))].sort();
const byYear = years.map((y) => ({ y, ...stats(liq.filter((r) => year(r) === y), "open") }));

// terciles of a number, within the liquid trades
const terciles = (rows, f) => { const s = rows.map(f).sort((a, b) => a - b), c1 = s[Math.floor(s.length / 3)], c2 = s[Math.floor((2 * s.length) / 3)]; return [c1, c2]; };
const [s1, s2] = terciles(liq, (r) => r.size), [l1, l2] = terciles(liq, (r) => r.turnover);
const splits = [
  ["Smallest third by size (target distance)", liq.filter((r) => r.size <= s1)], ["Middle third by size", liq.filter((r) => r.size > s1 && r.size <= s2)], ["Largest third by size", liq.filter((r) => r.size > s2)],
  ["Least traded third", liq.filter((r) => r.turnover <= l1)], ["Middle third by turnover", liq.filter((r) => r.turnover > l1 && r.turnover <= l2)], ["Most traded third", liq.filter((r) => r.turnover > l2)],
  ["Market above its 200-day average", liq.filter((r) => r.bull === true)], ["Market below its 200-day average", liq.filter((r) => r.bull === false)],
  ["Without likely circuit entries", liq.filter((r) => !r.locked)],
].map(([label, rows]) => ({ label, ...stats(rows, "open") }));

// ---------- a portfolio ----------
// Liquid trades bought at the next open, at most 10 open at once and one per share, each sized at 10% of the money the
// account had when it was bought. Equity moves when a trade is sold (so the drawdown shown is smoother than the truth).
function portfolio(rows, vid) {
  const ts = rows.filter((r) => r.v[vid]).sort((a, b) => a.v[vid].entryTime - b.v[vid].entryTime);
  const open = []; // { exit, t, size, net }
  let equity = 100, peak = 100, maxDD = 0, taken = 0, skipped = 0;
  const curve = [{ time: ts[0].v[vid].entryTime, equity }];
  const close = (upTo) => {
    open.sort((a, b) => a.exit - b.exit);
    while (open.length && open[0].exit <= upTo) {
      const p = open.shift();
      equity += p.size * p.net;
      peak = Math.max(peak, equity); maxDD = Math.min(maxDD, equity / peak - 1);
      curve.push({ time: p.exit, equity });
    }
  };
  for (const r of ts) {
    const v = r.v[vid];
    close(v.entryTime);
    if (open.length >= 10 || open.some((p) => p.t === r.t)) { skipped++; continue; }
    open.push({ exit: v.exitTime, t: r.t, size: equity * 0.1, net: v.net });
    taken++;
  }
  close(Infinity);
  const t0 = curve[0].time, t1 = curve.at(-1).time, yrs = (t1 - t0) / (365.25 * 86400);
  const i0 = dsexAt(t0), i1 = dsexAt(t1), bh = dsex[i1].close / dsex[i0].close;
  const yearly = [];
  let before = 100;
  for (const c of curve) {
    const y = +iso(c.time).slice(0, 4);
    if (yearly.at(-1)?.y !== y) yearly.push({ y, start: before, end: c.equity });
    yearly.at(-1).end = c.equity;
    before = c.equity;
  }
  return { taken, skipped, final: equity, cagr: Math.pow(equity / 100, 1 / yrs) - 1, maxDD, years: yrs, from: iso(t0), to: iso(t1), dsexCagr: Math.pow(bh, 1 / yrs) - 1, dsexMaxNote: "price index, no dividends",
    byYear: yearly.map((x) => ({ y: x.y, r: x.end / x.start - 1 })) };
}
const port = portfolio(liq, "open");

const result = { shares, patterns, trades: trades.length, liquidTrades: liq.length, variants: variantTable, byYear, splits, portfolio: port };
fs.writeFileSync(path.join(here, `../docs/${SLUG}-backtest.json`), JSON.stringify(result, null, 1));

// ---------- report ----------
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "n/a");
const sign = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%` : "n/a");
function chart(rows, key, title, note, fmt = sign) {
  const W = 760, rowH = 26, left = 250, pad = 14, H = rows.length * rowH + 40;
  const vals = rows.flatMap((r) => [r[key], r.lo ?? 0, r.hi ?? 0]).filter(Number.isFinite);
  const max = Math.max(...vals, 0.0001), min = Math.min(...vals, 0), sc = (W - left - pad - 50) / (max - min), x0 = left + (0 - min) * sc;
  const body = rows.map((r, k) => {
    const y = 30 + k * rowH, v = r[key], x = Math.min(x0, x0 + v * sc), w = Math.abs(v * sc);
    const ci = Number.isFinite(r.lo) ? `<line x1="${x0 + r.lo * sc}" x2="${x0 + r.hi * sc}" y1="${y + 9}" y2="${y + 9}" stroke="currentColor" stroke-width="1.5"/><line x1="${x0 + r.lo * sc}" x2="${x0 + r.lo * sc}" y1="${y + 4}" y2="${y + 14}" stroke="currentColor"/><line x1="${x0 + r.hi * sc}" x2="${x0 + r.hi * sc}" y1="${y + 4}" y2="${y + 14}" stroke="currentColor"/>` : "";
    return `<text x="${left - 8}" y="${y + 13}" text-anchor="end" font-size="12" fill="currentColor">${r.label} <tspan opacity=".55">n=${r.n}</tspan></text><rect x="${x}" y="${y + 3}" width="${Math.max(w, 1)}" height="12" rx="2" fill="${v >= 0 ? "var(--good)" : "var(--bad)"}" opacity=".85"/>${ci}<text x="${W - pad}" y="${y + 13}" text-anchor="end" font-size="11" fill="currentColor" opacity=".8">${fmt(v)}</text>`;
  }).join("");
  return `<figure><figcaption><b>${title}</b><br><span>${note}</span></figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><line x1="${x0}" x2="${x0}" y1="22" y2="${H - 6}" stroke="currentColor" opacity=".4"/>${body}</svg></figure>`;
}
const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, k) => `<${k ? "td" : "th"}>${c}</${k ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table>`;
const srow = (label, s) => [label, s.n, pct(s.target), pct(s.stop), pct(s.time), pct(s.win), sign(s.net), sign(s.control), sign(s.edge), `${sign(s.lo)} to ${sign(s.hi)}`];
const H = ["", "Trades", "Target", "Stop", "Timed out", "Winners", "Avg result", "Random days", "Edge", "95% range"];
const base = variantTable[1].liquid;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${TYPE} backtest</title>
<style>:root{--bg:#fff;--fg:#1c2230;--mut:#5d6677;--card:#f4f6fa;--line:#d9dee8;--good:#00875a;--bad:#c8102e}@media(prefers-color-scheme:dark){:root{--bg:#0f131b;--fg:#e6e9f0;--mut:#9aa3b5;--card:#171c27;--line:#2a3142;--good:#19e39a;--bad:#ff5f73}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:900px;margin:0 auto;padding:24px 16px 60px}h1{font-size:24px}h2{font-size:18px;margin-top:34px}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.k div{background:var(--card);border-radius:8px;padding:10px 12px}.k b{display:block;font-size:20px}.k span{color:var(--mut);font-size:12px}
figure{margin:18px 0;background:var(--card);border-radius:8px;padding:12px}figcaption span{color:var(--mut);font-size:13px}svg{width:100%;height:auto;color:var(--fg)}table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow-x:auto}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}thead th{color:var(--mut);font-weight:600}.n{color:var(--mut);font-size:13px}.w{background:var(--card);border-left:4px solid var(--bad);padding:10px 14px;border-radius:6px}</style>
<main><h1>${TYPE} on its own</h1>
<p class="w"><b>Read this first.</b> ${WINNER ? "The Double Bottom was chosen because it looked best in the run of all patterns, on this same data. Every number here is friendlier than a fresh test would be." : `The ${TYPE} was chosen because it showed no edge in the run of all patterns, on this same data, so a poor result here is no surprise and a good one would deserve extra doubt.`} The only pre-set cut is "liquid" (median turnover of at least BDT ${LIQUID / 1e6} million).</p>
<div class="k"><div><b>${trades.length.toLocaleString()}</b><span>${TYPE} trades (${liq.length.toLocaleString()} liquid)</span></div><div><b>${sign(base.net)}</b><span>avg result, liquid, next open, 0.30% costs</span></div><div><b>${sign(base.edge)}</b><span>over random days (${sign(base.lo)} to ${sign(base.hi)})</span></div><div><b>${pct(port.cagr)}</b><span>portfolio a year, against ${pct(port.dsexCagr)} for the DSEX</span></div></div>
<h2>Does it survive realistic fills and costs?</h2><p>The same ${TYPE} trades, filled four ways. The all-patterns run bought at the breakout close, which is the price you only know after the market has shut.</p>
${chart(variantTable.map((v) => ({ label: v.label, n: v.liquid.n, edge: v.liquid.edge, lo: v.liquid.lo, hi: v.liquid.hi })), "edge", "Edge over random days, liquid shares", "Right of the centre line means better than the same stop and target on random days.")}
${table(H, variantTable.flatMap((v) => [srow(`${v.label} (liquid)`, v.liquid), srow(`${v.label} (all shares)`, v.all)]))}
<h2>Year by year (liquid, next open, 0.30%)</h2>${chart(byYear.map((y) => ({ label: String(y.y), n: y.n, edge: y.edge, lo: y.lo, hi: y.hi })), "edge", "Edge by year", "A real edge shows up most years, not only in a few.")}
${table(["Year", ...H.slice(1)], byYear.map((y) => srow(String(y.y), y)))}
<h2>Which ${TYPE} trades work?</h2>${chart(splits.map((s) => ({ label: s.label, n: s.n, edge: s.edge, lo: s.lo, hi: s.hi })), "edge", "Edge by group (liquid, next open, 0.30%)", "Descriptive only: these groups were not chosen in advance, so do not pick the best one and trade it.")}
${table(H, splits.map((s) => srow(s.label, s)))}
<h2>As a portfolio</h2><p>Liquid trades bought at the next open from ${port.from} to ${port.to}: at most 10 open at once, one per share, each 10% of the account when bought. ${port.taken} trades were taken and ${port.skipped} skipped because 10 were already open or the share was already held.</p>
<div class="k"><div><b>${(port.final / 100).toFixed(2)}x</b><span>account over ${port.years.toFixed(1)} years</span></div><div><b>${pct(port.cagr)}</b><span>a year</span></div><div><b>${pct(port.maxDD)}</b><span>worst drop (on sold trades only)</span></div><div><b>${pct(port.dsexCagr)}</b><span>DSEX a year (price index, no dividends)</span></div></div>
${chart(port.byYear.map((y) => ({ label: String(y.y), n: "", edge: y.r })), "edge", "Portfolio result by year", "Money-weighted from the trades sold in each year.")}
<h2>Limits</h2><ul><li><b>Chosen after the fact</b>, as above. The holdout from 25 Jan 2026 is the only stretch the detector never saw, and it is short.</li>
<li><b>Survivorship:</b> the data holds shares that still have records; shares that were delisted may be missing, which flatters any buy strategy.</li>
<li><b>Fills:</b> a buy at the next open assumes enough sellers at that price. Circuit limits, the 2020 floor-price period, queues and taxes are not modelled. The 0.80% and 1.30% rows show how fast a thin edge disappears.</li>
<li><b>Overlap:</b> the portfolio drawdown only moves when a trade is sold, so the true worst drop was deeper.</li></ul>
<p class="n">Script: scripts/backtest-double-bottom.mjs. Same data as the all-patterns report.</p></main></html>`;
fs.writeFileSync(path.join(here, `../docs/${SLUG}-backtest.html`), html);

console.log(`${TYPE}: shares ${shares}, patterns found ${patterns}, traded ${trades.length} (${liq.length} liquid)`);
for (const v of variantTable) for (const k of ["liquid", "all"]) { const s = v[k]; console.log(`${v.id.padEnd(7)} ${k.padEnd(6)} n=${s.n} tgt ${pct(s.target)} stop ${pct(s.stop)} win ${pct(s.win)} net ${sign(s.net)} ctl ${sign(s.control)} edge ${sign(s.edge)} [${sign(s.lo)}, ${sign(s.hi)}]`); }
for (const y of byYear) console.log(y.y, `n=${y.n}`, `net ${sign(y.net)} edge ${sign(y.edge)} [${sign(y.lo)}, ${sign(y.hi)}]`);
for (const s of splits) console.log(s.label.padEnd(42), `n=${s.n}`, `net ${sign(s.net)} edge ${sign(s.edge)} [${sign(s.lo)}, ${sign(s.hi)}]`);
console.log(JSON.stringify({ ...port, byYear: undefined }), port.byYear.map((y) => `${y.y}:${pct(y.r)}`).join(" "));
