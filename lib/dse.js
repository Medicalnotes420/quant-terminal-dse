// Dhaka Stock Exchange (DSE) data from your own day-end CSV files (read-only). Chart it as DSE:AL-HAJTEX,
// DSE:DSEX or DSE:DS30. History is daily; weekly and monthly bars are built from it.
// Files are read from QT_DSE_DIR (default: the Stockapp data/raw/dse folder):
//   dayend_*.csv           date,ticker,open,high,low,close,volume,trades,... (a share-specific file wins over stocknow)
//   market_summary_*.csv   date,dsex[,ds30,total_volume,...]
// The optional live price comes from your own dse-quote Worker (QT_DSE_WORKER, set to "off" to disable).

import fs from "node:fs";
import path from "node:path";
import { parseTf, resample } from "../public/lib/series.js";

export const DSE_DIR = process.env.QT_DSE_DIR || "../../Stockapp/data/raw/dse";
const WORKER = process.env.QT_DSE_WORKER || "off";
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const INDICES = { DSEX: "dsex", DS30: "ds30" };

function table(file) {
  const [head, ...rows] = fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const cols = head.split(",").map((c) => c.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v.trim()])));
}
const day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 1000;

let cache = null; // { stamp, shares: Map<ticker, bars>, indices: Map<name, bars> }
export function load() {
  const names = fs.existsSync(DSE_DIR) ? fs.readdirSync(DSE_DIR).filter((f) => f.endsWith(".csv")).sort() : [];
  if (!names.length) throw bad(`No DSE files found in ${DSE_DIR}. Set QT_DSE_DIR to the folder that holds your dayend_*.csv files.`, 404);
  const stamp = names.map((n) => `${n}:${fs.statSync(path.join(DSE_DIR, n)).mtimeMs}`).join("|");
  if (cache?.stamp === stamp) return cache;

  const shares = new Map();
  // Share-specific files first, so their prices win over the bulk stocknow files, like dse_quant does.
  const dayend = names.filter((n) => n.startsWith("dayend_")).sort((a, b) => /stocknow/.test(a) - /stocknow/.test(b));
  for (const n of dayend)
    for (const r of table(path.join(DSE_DIR, n))) {
      const t = (r.ticker || "").toUpperCase();
      const o = +r.open, h = +r.high, l = +r.low, c = +r.close;
      // DSE repeats yesterday's close with zero trades on a no-trade day: that is not a bar.
      if (!t || !r.date || !(+r.trades > 0) || ![o, h, l, c].every((x) => x > 0)) continue;
      if (!shares.has(t)) shares.set(t, new Map());
      const m = shares.get(t);
      if (!m.has(r.date)) m.set(r.date, { time: day(r.date), open: o, high: h, low: l, close: c, volume: +r.volume || 0 });
    }

  const raw = { DSEX: new Map(), DS30: new Map() };
  for (const n of names.filter((n) => n.startsWith("market_summary")))
    for (const r of table(path.join(DSE_DIR, n)))
      for (const [name, col] of Object.entries(INDICES))
        if (r.date && +r[col] > 0 && !raw[name].has(r.date)) raw[name].set(r.date, { close: +r[col], volume: +r.total_volume || 0 });

  // Your files hold DSEX for only some days. On the days it is missing, chain the median share return onto the last
  // level, like dse_quant's fill_index. These levels are estimates: they are listed in `estimated`, not written back.
  const estimated = [];
  const real = [...raw.DSEX.keys()].sort();
  if (real.length) {
    const byDate = new Map();
    for (const m of shares.values()) {
      const rows = [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
      for (let j = 1; j < rows.length; j++) {
        const r = rows[j][1].close / rows[j - 1][1].close - 1;
        // Beyond the 10% price limit means a bonus, split or other corporate action, not a market move.
        if (Math.abs(r) > 0.11) continue;
        if (!byDate.has(rows[j][0])) byDate.set(rows[j][0], []);
        byDate.get(rows[j][0]).push(r);
      }
    }
    let level = raw.DSEX.get(real[0]).close;
    for (const date of [...byDate.keys()].sort()) {
      if (date < real[0]) continue;
      if (raw.DSEX.has(date)) level = raw.DSEX.get(date).close;
      else if (byDate.get(date).length >= 20) {
        const v = byDate.get(date).sort((a, b) => a - b), mid = v.length >> 1;
        level *= 1 + (v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2);
        raw.DSEX.set(date, { close: level, volume: 0 });
        estimated.push(date);
      }
    }
  }

  const out = (m) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
  const indices = new Map();
  for (const [name, m] of Object.entries(raw)) {
    const days = [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    if (!days.length) continue;
    // An index has only a close. Each bar opens at the previous close, so the candle shows the day's move.
    indices.set(name, days.map(([date, v], i) => {
      const open = i ? days[i - 1][1].close : v.close;
      return { time: day(date), open, high: Math.max(open, v.close), low: Math.min(open, v.close), close: v.close, volume: v.volume };
    }));
  }
  cache = { stamp, shares: new Map([...shares].map(([t, m]) => [t, out(m)])), indices, estimated };
  return cache;
}

export function tickers() {
  const d = load();
  return [...d.indices.keys(), ...[...d.shares.keys()].sort()];
}

// Every share's last close, change on the day before, and volume, for the All shares list. Shares that
// stopped trading (last bar more than 14 days before the newest bar anywhere) are left out.
export function snapshot() {
  const d = load();
  const newest = Math.max(...[...d.shares.values()].map((b) => b.at(-1).time));
  const out = [];
  for (const [t, bars] of d.shares) {
    const last = bars.at(-1), prev = bars.at(-2);
    if (newest - last.time > 14 * 86400) continue;
    out.push({
      symbol: `DSE:${t}`, ticker: t, price: last.close, volume: last.volume,
      changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : null,
      date: new Date(last.time * 1000).toISOString().slice(0, 10),
    });
  }
  return out.sort((a, b) => (a.ticker < b.ticker ? -1 : 1));
}

// "AL-HAJTEX" for a share, "DSEX" for the index. Names are matched without case.
function barsOf(ticker) {
  const d = load();
  const t = String(ticker).toUpperCase();
  const bars = d.indices.get(t) || d.shares.get(t);
  if (!bars) throw bad(`DSE:${t} isn't in your DSE files (${DSE_DIR}). Check the code, or add the latest day-end file.`, 404);
  return { t, bars, isIndex: d.indices.has(t) };
}

// The Worker has no open or volume: a live bar opens at yesterday's close and carries no volume.
async function live(t) {
  if (WORKER === "off" || process.env.QT_OFFLINE === "1") return null;
  try {
    const r = await fetch(`${WORKER.replace(/\/+$/, "")}/quote?code=${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const date = new Date(Date.parse(j.fetchedAt) + 6 * 3600e3); // Dhaka is UTC+6
    if (!r.ok || !(j.ltp > 0) || !(j.ycp > 0) || Number.isNaN(+date)) return null;
    const dow = date.getUTCDay();
    if (dow === 5 || dow === 6) return null; // DSE is closed Friday and Saturday: this is the last session's price again
    const time = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
    return { time, open: j.ycp, high: Math.max(j.high, j.ltp), low: Math.min(j.low, j.ltp), close: j.ltp, volume: 0 };
  } catch {
    return null;
  }
}

// DSE trades Sunday to Thursday, so its weeks start on Sunday. resample() starts weeks on Monday:
// shift every bar a day later, bucket, then shift the buckets back a day.
function rebucket(bars, tf) {
  if (tf === "1D") return bars;
  if (parseTf(tf).unit !== "W") return resample(bars, tf);
  return resample(bars.map((b) => ({ ...b, time: b.time + 86400 })), tf).map((b) => ({ ...b, time: b.time - 86400 }));
}

export async function candles(ticker, tf, limit) {
  const { t, bars, isIndex } = barsOf(ticker);
  if (parseTf(tf).seconds < 86400) throw bad("DSE history is daily, so DSE charts start at 1D.");
  const notes = [`Daily bars from your files in ${DSE_DIR}, last day ${new Date(bars.at(-1).time * 1000).toISOString().slice(0, 10)}.`];
  if (isIndex) notes.push(`${t} has a close only, so each bar opens at the previous close and has no wicks.`);
  const est = t === "DSEX" ? load().estimated : [];
  if (est.length) notes.push(`${est.length} DSEX days your files lack are estimated from the median share return (${est[0]} to ${est.at(-1)}).`);
  let all = bars;
  const l = isIndex ? null : await live(t);
  if (l && l.time > bars.at(-1).time) {
    all = [...bars, l];
    notes.push("The last bar is today's live price from your Worker: it opens at the previous close and has no volume.");
  }
  return { symbol: `DSE:${t}`, tf, provider: "DSE files", candles: rebucket(all, tf).slice(-limit), notes };
}

// Bars as an OHLCV CSV the terminal's importer reads.
export function csvOf(ticker) {
  const { bars } = barsOf(ticker);
  const iso = (b) => new Date(b.time * 1000).toISOString().slice(0, 10);
  return ["date,open,high,low,close,volume", ...bars.map((b) => `${iso(b)},${b.open},${b.high},${b.low},${b.close},${b.volume}`)].join("\n") + "\n";
}
