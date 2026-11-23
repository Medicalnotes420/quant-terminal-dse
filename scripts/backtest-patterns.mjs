// Backtest of the All Chart Patterns detector on DSE equities, 2012 to now.
//
//   node scripts/backtest-patterns.mjs            writes docs/pattern-backtest.html and docs/pattern-backtest.json
//
// What is tested: every pattern that broke out is traded on the bar it broke out, but only if the pattern was already
// known by then (the detector confirms a pivot 5 bars late, so a break inside those 5 bars could not have been traded).
// Long trades enter at that bar's close; the exit is the pattern's own stop or target, or the close 60 bars later.
// DSE rules applied: T+2 (nothing can be sold in the first 2 bars after the entry; a gap through the stop or target
// fills at the open), 0.30% commission each side, stop first when one bar touches both. Short trades are not
// possible on DSE, so bearish patterns are only described, not traded.
// Control: the same share, the same stop and target distances (in %), entered on 20 random bars. If the pattern adds
// nothing, its result matches the control.
//
// Data: the Mendeley A2 adjusted equities (2012 to 22 Jan 2026) joined to the terminal's own day-end files (from 25 Jan
// 2026, adjusted for bonus and rights), so the last stretch is a holdout the detector's settings were never tuned on.
process.env.QT_DSE_WORKER = "off";
process.env.QT_OFFLINE = "1";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect } from "../public/lib/chartpatterns.js";
import * as dse from "../lib/dse.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const A2 = "../../Stockapp/data/raw/a2/x/Dhaka Stock Exchange End-of-Day Financial Dataset";
const COST = 0.003, HOLD = 60, TPLUS = 2, LIQUID = 5e6, CONTROL = 20, HOLDOUT = Date.UTC(2026, 0, 25) / 1000;

// ---------- data ----------
const csv = (f) => fs.readFileSync(f, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
const equities = csv(`${A2}/metadata/company_metadata.csv`).filter((r) => r[1] === "Equity").map((r) => r[0].trim());

function series(t) {
  const adj = `${A2}/Company Separated Adjusted Data/${t}.csv`, raw = `${A2}/Company Separated UnAdjusted Data/${t}.csv`;
  if (!fs.existsSync(adj)) return null;
  const traded = new Map(fs.existsSync(raw) ? csv(raw).map((r) => [r[0], +r[4] * +r[5]]) : []);
  const bars = csv(adj).map(([d, o, h, l, c, v]) => ({ time: Date.parse(d) / 1000, open: +o, high: +h, low: +l, close: +c, volume: +v, val: traded.get(d) ?? +c * +v }));
  const lastA2 = bars.at(-1)?.time ?? 0;
  return { bars, lastA2 };
}

async function fullSeries(t) {
  const s = series(t);
  if (!s) return null;
  let bars = s.bars;
  try {
    const more = (await dse.candles(t, "1D", 1e9, { adjusted: true })).candles.filter((b) => b.time > s.lastA2 && b.volume > 0);
    bars = bars.concat(more.map((b) => ({ ...b, val: b.close * b.volume })));
  } catch { /* the share is not in the 2026 files */ }
  bars = bars.filter((b) => b.volume > 0 && b.high >= b.low && b.close > 0);
  return bars.length >= 250 ? bars : null;
}

// ---------- one trade ----------
// Long only. Entry on bar i at `entry`; exits are allowed from bar i + TPLUS (T+2). Returns { net, gross, reason, hold }.
function simulate(bars, i, entry, stop, target) {
  const last = Math.min(bars.length - 1, i + HOLD);
  for (let j = i + TPLUS; j <= last; j++) {
    const b = bars[j];
    let px = null, reason = null;
    if (b.open <= stop) [px, reason] = [b.open, "stop"]; // gapped through
    else if (b.low <= stop) [px, reason] = [stop, "stop"]; // stop first when a bar touches both
    else if (b.open >= target) [px, reason] = [b.open, "target"];
    else if (b.high >= target) [px, reason] = [target, "target"];
    if (px != null) return fin(px, reason, j - i);
  }
  return fin(bars[last].close, "time", last - i);
  function fin(px, reason, hold) {
    const gross = px / entry - 1, net = (px * (1 - COST)) / (entry * (1 + COST)) - 1;
    return { gross, net, reason, hold };
  }
}

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

// patterns of one share that could have been traded in real time
function tradable(bars, list) {
  return list.filter((p) => p.breakI != null && p.breakI >= p.formedAt && p.target && p.stop != null);
}

// ---------- run ----------
const CFG = { lookback: 1e9 };
const trades = [], skipped = { notKnown: 0, badLevels: 0, alreadyThere: 0 }, controlNote = [];
let shares = 0, barCount = 0;
const all = new Map();
for (const [k, t] of equities.entries()) {
  const bars = await fullSeries(t);
  if (!bars) continue;
  shares++; barCount += bars.length; all.set(t, bars);
  const list = detect(bars, {}, CFG);
  skipped.notKnown += list.filter((p) => p.breakI != null && p.breakI < p.formedAt).length;
  const rand = rng(1000 + k);
  for (const p of tradable(bars, list)) {
    const i = p.breakI, entry = bars[i].close, stop = p.stop, target = p.target.price, bull = p.dir === "bull";
    if (bars[i].high === bars[i].low) { skipped.alreadyThere++; continue; }
    if (bull ? !(stop < entry && entry < target) : !(target < entry && entry < stop)) { skipped.badLevels++; continue; }
    const prev = bars[i - 1]?.close, locked = prev > 0 && bars[i].close === bars[i].high && bars[i].close / prev - 1 >= 0.08; // probably stuck at the upper circuit: no seller, so no fill
    const liquid = median(bars.slice(Math.max(0, i - 19), i + 1).map((b) => b.val)) >= LIQUID;
    const rec = { t, type: p.type, dir: p.dir, time: bars[i].time, liquid, locked, risk: Math.abs(entry - stop) / entry, reward: Math.abs(target - entry) / entry };
    if (bull) {
      Object.assign(rec, simulate(bars, i, entry, stop, target));
      // control: same share, same distances, random bars
      const ctl = [];
      for (let n = 0; n < CONTROL; n++) {
        const j = 40 + Math.floor(rand() * (bars.length - 40 - HOLD - 1)), e = bars[j].close;
        ctl.push(simulate(bars, j, e, e * (1 - rec.risk), e * (1 + rec.reward)).net);
      }
      rec.control = mean(ctl);
    } else {
      // descriptive only: a mirror-image trade without T+2 or costs, to say whether the pattern's target came first
      let reason = "time";
      for (let j = i + 1; j <= Math.min(bars.length - 1, i + HOLD); j++) {
        if (bars[j].high >= stop) { reason = "stop"; break; }
        if (bars[j].low <= target) { reason = "target"; break; }
      }
      rec.reason = reason;
    }
    trades.push(rec);
  }
}

// ---------- real-time check ----------
// Run the detector on the first 60% of each of 40 shares and on all of it. Every trade the short run finds should also
// be in the long run, and every long-run trade that broke out in the first 60% should be in the short run.
const sample = [...all.entries()].filter((_, k) => k % Math.max(1, Math.floor(all.size / 40)) === 0).slice(0, 40);
let inShort = 0, shortMissing = 0, longMissing = 0;
for (const [t, bars] of sample) {
  const cut = Math.floor(bars.length * 0.6), key = (p) => `${p.type}|${p.breakI}|${p.points[0].i}`;
  const a = new Set(tradable(bars, detect(bars.slice(0, cut), {}, CFG)).filter((p) => p.breakI < cut - 1).map(key));
  const b = new Set(tradable(bars, detect(bars, {}, CFG)).filter((p) => p.breakI < cut - 1).map(key));
  inShort += a.size;
  for (const k of a) if (!b.has(k)) shortMissing++;
  for (const k of b) if (!a.has(k)) longMissing++;
}

// ---------- statistics ----------
function cluster(rows, f, keyOf, seed = 7) {
  // bootstrap over shares: a share's trades overlap in time and move together, so they are resampled as one block
  const by = new Map();
  for (const r of rows) (by.get(keyOf(r)) ?? by.set(keyOf(r), []).get(keyOf(r))).push(f(r));
  const groups = [...by.values()], r = rng(seed), out = [];
  if (groups.length < 5) return [NaN, NaN];
  for (let n = 0; n < 1500; n++) {
    let s = 0, c = 0;
    for (let g = 0; g < groups.length; g++) { const pick = groups[Math.floor(r() * groups.length)]; for (const x of pick) { s += x; c++; } }
    out.push(s / c);
  }
  out.sort((x, y) => x - y);
  return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
}
const share = (rows, reason) => (rows.length ? rows.filter((r) => r.reason === reason).length / rows.length : NaN);
function summarize(rows) {
  const diff = (r) => r.net - r.control;
  // two ways to resample, and the wider range is reported: by share (a share's trades overlap) and by calendar month
  // (shares break out together when the whole market moves)
  const a = cluster(rows, diff, (r) => r.t), b = cluster(rows, diff, (r) => new Date(r.time * 1000).toISOString().slice(0, 7));
  const lo = Math.min(a[0], b[0]), hi = Math.max(a[1], b[1]);
  return {
    n: rows.length, shares: new Set(rows.map((r) => r.t)).size,
    target: share(rows, "target"), stop: share(rows, "stop"), time: share(rows, "time"),
    net: mean(rows.map((r) => r.net)), median: median(rows.map((r) => r.net)), control: mean(rows.map((r) => r.control)),
    edge: mean(rows.map(diff)), edgeLo: lo, edgeHi: hi, risk: mean(rows.map((r) => r.risk)), reward: mean(rows.map((r) => r.reward)), hold: mean(rows.map((r) => r.hold)),
  };
}
const bull = trades.filter((r) => r.dir === "bull"), bear = trades.filter((r) => r.dir === "bear");
const types = [...new Set(bull.map((r) => r.type))].sort();
const slices = {
  "All bullish patterns": bull,
  "Liquid shares only": bull.filter((r) => r.liquid),
  "Liquid, without likely circuit entries": bull.filter((r) => r.liquid && !r.locked),
  "Liquid, holdout (Jan 2026 on)": bull.filter((r) => r.liquid && r.time >= HOLDOUT),
  "Liquid, 2012 to 2019": bull.filter((r) => r.liquid && r.time < Date.UTC(2020, 0, 1) / 1000),
  "Liquid, 2020 to Jan 2026": bull.filter((r) => r.liquid && r.time >= Date.UTC(2020, 0, 1) / 1000 && r.time < HOLDOUT),
  "2012 to 2019": bull.filter((r) => r.time < Date.UTC(2020, 0, 1) / 1000),
  "2020 to Jan 2026": bull.filter((r) => r.time >= Date.UTC(2020, 0, 1) / 1000 && r.time < HOLDOUT),
  "Holdout: Jan 2026 on": bull.filter((r) => r.time >= HOLDOUT),
  "Double Bottom, liquid, 2012 to 2019": bull.filter((r) => r.type === "Double Bottom" && r.liquid && r.time < Date.UTC(2020, 0, 1) / 1000),
  "Double Bottom, liquid, 2020 to Jan 2026": bull.filter((r) => r.type === "Double Bottom" && r.liquid && r.time >= Date.UTC(2020, 0, 1) / 1000 && r.time < HOLDOUT),
  "Double Bottom, liquid, holdout": bull.filter((r) => r.type === "Double Bottom" && r.liquid && r.time >= HOLDOUT),
};
const result = {
  made: "(stamp is added by the caller)", shares, bars: barCount, bullTrades: bull.length, bearPatterns: bear.length, skipped,
  realtimeCheck: { sharesChecked: sample.length, shortRunTrades: inShort, inShortNotInLong: shortMissing, inLongNotInShort: longMissing },
  slices: Object.fromEntries(Object.entries(slices).map(([k, v]) => [k, summarize(v)])),
  byType: Object.fromEntries(types.map((t) => [t, { all: summarize(bull.filter((r) => r.type === t)), liquid: summarize(bull.filter((r) => r.type === t && r.liquid)) }])),
  bear: Object.fromEntries([...new Set(bear.map((r) => r.type))].sort().map((t) => { const rows = bear.filter((r) => r.type === t); return [t, { n: rows.length, target: share(rows, "target"), stop: share(rows, "stop"), time: share(rows, "time") }]; })),
};
fs.writeFileSync(path.join(here, "../docs/pattern-backtest.json"), JSON.stringify(result, null, 1));

// ---------- report ----------
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "n/a");
const sign = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%` : "n/a");
function bars(rows, key, fmt, title, note) {
  const W = 760, rowH = 26, left = 230, pad = 14, H = rows.length * rowH + 40;
  const vals = rows.flatMap((r) => [r[key], r.ctl ?? 0, r.lo ?? 0, r.hi ?? 0]).filter(Number.isFinite);
  const max = Math.max(...vals, 0.0001), min = Math.min(...vals, 0), sc = (W - left - pad) / (max - min), x0 = left + (0 - min) * sc;
  const svg = rows.map((r, k) => {
    const y = 30 + k * rowH, v = r[key], x = Math.min(x0, x0 + v * sc), w = Math.abs(v * sc);
    const ci = Number.isFinite(r.lo) ? `<line x1="${x0 + r.lo * sc}" x2="${x0 + r.hi * sc}" y1="${y + 9}" y2="${y + 9}" stroke="currentColor" stroke-width="1.5"/><line x1="${x0 + r.lo * sc}" x2="${x0 + r.lo * sc}" y1="${y + 4}" y2="${y + 14}" stroke="currentColor"/><line x1="${x0 + r.hi * sc}" x2="${x0 + r.hi * sc}" y1="${y + 4}" y2="${y + 14}" stroke="currentColor"/>` : "";
    return `<text x="${left - 8}" y="${y + 13}" text-anchor="end" font-size="12" fill="currentColor">${r.label} <tspan opacity=".55">n=${r.n}</tspan></text><rect x="${x}" y="${y + 3}" width="${Math.max(w, 1)}" height="12" rx="2" fill="${v >= 0 ? "var(--good)" : "var(--bad)"}" opacity=".85"/>${ci}<text x="${W - pad}" y="${y + 13}" text-anchor="end" font-size="11" fill="currentColor" opacity=".8">${fmt(v)}</text>`;
  }).join("");
  return `<figure><figcaption><b>${title}</b><br><span>${note}</span></figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><line x1="${x0}" x2="${x0}" y1="22" y2="${H - 6}" stroke="currentColor" opacity=".4"/>${svg}</svg></figure>`;
}
const mk = (label, s, key) => ({ label, n: s.n, [key]: s[key], lo: s.edgeLo, hi: s.edgeHi });
const edgeRows = Object.entries(result.slices).map(([k, s]) => mk(k, s, "edge"));
const typeRows = types.map((t) => mk(t, result.byType[t].all, "edge")), typeLiquidRows = types.map((t) => mk(t, result.byType[t].liquid, "edge"));
const rateRows = types.map((t) => ({ label: t, n: result.byType[t].all.n, target: result.byType[t].all.target, stop: result.byType[t].all.stop }));
const tbl = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, k) => `<${k ? "td" : "th"}>${c}</${k ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table>`;
const sumRow = (name, s) => [name, s.n, s.shares, pct(s.target), pct(s.stop), pct(s.time), sign(s.net), sign(s.control), sign(s.edge), `${sign(s.edgeLo)} to ${sign(s.edgeHi)}`];
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chart pattern backtest</title>
<style>:root{--bg:#fff;--fg:#1c2230;--mut:#5d6677;--card:#f4f6fa;--line:#d9dee8;--good:#00875a;--bad:#c8102e}@media(prefers-color-scheme:dark){:root{--bg:#0f131b;--fg:#e6e9f0;--mut:#9aa3b5;--card:#171c27;--line:#2a3142;--good:#19e39a;--bad:#ff5f73}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:880px;margin:0 auto;padding:24px 16px 60px}h1{font-size:24px}h2{font-size:18px;margin-top:34px}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.k div{background:var(--card);border-radius:8px;padding:10px 12px}.k b{display:block;font-size:20px}.k span{color:var(--mut);font-size:12px}
figure{margin:18px 0;background:var(--card);border-radius:8px;padding:12px}figcaption span{color:var(--mut);font-size:13px}svg{width:100%;height:auto;color:var(--fg)}table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow-x:auto}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}thead th{color:var(--mut);font-weight:600}.n{color:var(--mut);font-size:13px}</style>
<main><h1>Do the chart patterns work on the DSE?</h1>
<p class="n">${shares} equities, ${barCount.toLocaleString()} daily bars, 2012 to Nov 2026. Detector settings are the terminal's defaults; nothing was tuned on this data.</p>
<div class="k"><div><b>${bull.length.toLocaleString()}</b><span>bullish pattern trades</span></div><div><b>${sign(result.slices["All bullish patterns"].net)}</b><span>average result per trade, after 0.60% costs</span></div><div><b>${sign(result.slices["All bullish patterns"].control)}</b><span>same trade on random days</span></div><div><b>${sign(result.slices["All bullish patterns"].edge)}</b><span>pattern minus random</span></div></div>
<h2>How to read this</h2><p>Each pattern that broke out upward is bought at that day's close, with the pattern's own stop and target, a 60-bar time limit, T+2 settlement and 0.30% commission each way. The <b>random-day control</b> repeats the same stop and target distances on 20 random days of the same share. The <b>edge</b> is the difference: it is what the pattern adds beyond the stop and target themselves. The line on each bar is a 95% range from resampling whole shares and, separately, whole calendar months (the wider of the two), because one share's trades overlap and many shares break out together when the market moves.</p>
${bars(edgeRows, "edge", sign, "Edge over random days, per trade", "Bars right of the centre line beat the control; a line that crosses zero means no proof of an edge.")}
${bars(typeRows, "edge", sign, "Edge by pattern type, all shares", "Includes thinly traded shares, where a fill at the close is optimistic.")}
${bars(typeLiquidRows, "edge", sign, "Edge by pattern type, liquid shares only", "The version closest to what could be traded.")}
<h2>Summary</h2>${tbl(["", "Trades", "Shares", "Hit target", "Hit stop", "Timed out", "Avg result", "Random days", "Edge", "95% range of edge"], [...Object.entries(result.slices).map(([k, s]) => sumRow(k, s)), ...types.map((t) => sumRow(t, result.byType[t].all)), ...types.map((t) => sumRow(`${t} (liquid)`, result.byType[t].liquid))])}
${bars(rateRows.map((r) => ({ ...r, target: r.target })), "target", (v) => pct(v), "How often the target came first", "Stops are hit "+ "about " + pct(result.slices["All bullish patterns"].stop, 0) + " of the time overall.")}
<h2>Bearish patterns (descriptive only)</h2><p>Short selling is not available, so these were not traded. This shows how often the pattern's downward target came before its stop.</p>${tbl(["Pattern", "Count", "Target first", "Stop first", "Neither"], Object.entries(result.bear).map(([t, r]) => [t, r.n, pct(r.target), pct(r.stop), pct(r.time)]))}
<h2>Checks and limits</h2><ul>
<li><b>Real-time check.</b> On ${sample.length} shares the detector was run on the first 60% of the history and on all of it. Of ${inShort} trades found on the short history, ${shortMissing} were absent from the full run; ${longMissing} trades in the full run were not found on the short history. ${shortMissing + longMissing === 0 ? "The detector gave the same trades either way." : "A gap means the full run knew something the short run could not (a larger pattern replacing a smaller one), so results are slightly flattering."}</li>
<li><b>Skipped.</b> ${skipped.notKnown} breakouts happened before the pattern could have been known and were not traded; ${skipped.badLevels} had a stop or target on the wrong side of the entry; ${skipped.alreadyThere} were locked bars.</li>
<li><b>Many patterns, many tests.</b> ${types.length} pattern types were looked at, so one that looks good by luck is expected. Trust a type only if it holds in the liquid subset, in both halves of the history and in the holdout.</li>
<li><b>Not modelled:</b> circuit-breaker limits and the floor-price period of 2020, queue position, slippage beyond the 0.30% (a thin share can cost far more), tick rounding, dividends and taxes. "Liquid" means a median daily turnover of at least BDT ${LIQUID / 1e6} million over the 20 days before entry.</li>
<li><b>Trades overlap.</b> The same share can give several overlapping patterns, so the trade count overstates independent evidence. The 95% ranges account for this; the plain counts do not.</li></ul>
<p class="n">Script: scripts/backtest-patterns.mjs. Data: Mendeley A2 adjusted equities to 22 Jan 2026, then the terminal's day-end files adjusted for bonus and rights.</p></main></html>`;
fs.writeFileSync(path.join(here, "../docs/pattern-backtest.html"), html);

console.log(JSON.stringify({ shares, bars: barCount, bull: bull.length, bear: bear.length, skipped, realtime: result.realtimeCheck }, null, 1));
for (const [k, s] of Object.entries(result.slices)) console.log(k.padEnd(24), `n=${s.n}`, `tgt ${pct(s.target)} stop ${pct(s.stop)}`, `net ${sign(s.net)} ctl ${sign(s.control)} edge ${sign(s.edge)} [${sign(s.edgeLo)}, ${sign(s.edgeHi)}]`);
for (const t of types) { const s = result.byType[t].liquid; console.log("liquid", t.padEnd(22), `n=${s.n}`, `tgt ${pct(s.target)} stop ${pct(s.stop)} net ${sign(s.net)} edge ${sign(s.edge)} [${sign(s.edgeLo)}, ${sign(s.edgeHi)}]`); }
for (const t of types) { const s = result.byType[t].all; console.log(t.padEnd(28), `n=${s.n}`, `tgt ${pct(s.target)} stop ${pct(s.stop)} net ${sign(s.net)} edge ${sign(s.edge)} [${sign(s.edgeLo)}, ${sign(s.edgeHi)}]`); }
