// Dhaka Stock Exchange (DSE) data from your own day-end CSV files (read-only). Chart it as DSE:AL-HAJTEX,
// DSE:DSEX or DSE:DS30. History is daily; weekly and monthly bars are built from it.
// Files are read from QT_DSE_DIR (default: the Stockapp data/raw/dse folder):
//   dayend_*.csv           date,ticker,open,high,low,close,volume,trades,... (a share-specific file wins over stocknow)
//   market_summary_*.csv   date,dsex[,ds30,total_volume,...]
// The optional live price comes from your own dse-quote Worker (QT_DSE_WORKER, set to "off" to disable).
// Hourly charts (1h, 2h, 4h) come from StockNow's history endpoint, about the last 300 hourly bars of one share.

import * as fundamentals from "./fundamentals.js";
import { adjustBars, actionsFor } from "./adjust.js";
import fs from "node:fs";
import path from "node:path";
import { parseTf, resample } from "../public/lib/series.js";

export const DSE_DIR = process.env.QT_DSE_DIR || "../../Stockapp/data/raw/dse";
const WORKER = process.env.QT_DSE_WORKER || "off";
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

const STOCKNOW = (process.env.QT_STOCKNOW_URL || "https://stocknow.com.bd/api/v1/instruments").replace(/\/+$/, "");

// StockNow sends columns: open, high, low, close, volume, UTC seconds. Times stay UTC seconds: the chart shows them in
// the viewer's own time zone, which in Dhaka is the exchange's.
export function parseHourly(d) {
  if (!Array.isArray(d) || d.length < 6 || !Array.isArray(d[5])) throw bad(`StockNow sent an unexpected hourly reply: ${String(JSON.stringify(d)).slice(0, 120)}`, 502);
  const [o, h, l, c, v, t] = d;
  const bars = [];
  for (let k = 0; k < t.length; k++) {
    const b = { time: Math.round(+t[k]), open: +o[k], high: +h[k], low: +l[k], close: +c[k], volume: +v[k] || 0 };
    if (b.time > 0 && [b.open, b.high, b.low, b.close].every((x) => x > 0)) bars.push(b);
  }
  return bars.sort((a, b) => a.time - b.time);
}

const hourlyCache = new Map(); // CODE -> { at, bars }, kept a minute so a chart and its live refresh share one request
async function hourly(t) {
  const hit = hourlyCache.get(t);
  if (hit && Date.now() - hit.at < 60000) return hit.bars;
  let r;
  try {
    // not adjusted: these are the prices that traded
    r = await fetch(`${STOCKNOW}/${encodeURIComponent(t)}/history?data2=true&resolution=60&adjusted=false`, { headers: { "User-Agent": "quant-terminal" }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw bad("StockNow didn't answer, so there are no hourly bars right now. Daily charts still work.", 502);
  }
  if (!r.ok) throw bad(`StockNow has no hourly bars for ${t} (it answered ${r.status}).`, r.status === 404 ? 404 : 502);
  const bars = parseHourly(await r.json());
  if (!bars.length) throw bad(`StockNow sent no hourly bars for ${t}.`, 502);
  hourlyCache.set(t, { at: Date.now(), bars });
  return bars;
}
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
      if (!m.has(r.date)) m.set(r.date, { time: day(r.date), open: o, high: h, low: l, close: c, volume: +r.volume || 0, valueMn: +r.value_mn || 0 });
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

// The Details panel's market numbers for one share or index: last bar, change, and the range since the first bar.
export function detail(ticker) {
  const { t, bars, isIndex } = barsOf(ticker);
  const last = bars.at(-1), prev = bars.at(-2);
  return {
    symbol: `DSE:${t}`, ticker: t, isIndex, date: new Date(last.time * 1000).toISOString().slice(0, 10),
    open: last.open, high: last.high, low: last.low, close: last.close, prevClose: prev?.close ?? null,
    change: prev ? last.close - prev.close : null, changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : null,
    // no trade count: the StockNow day-end files write 1 for it on busy days, so it cannot be shown
    volume: last.volume, valueMn: isIndex ? null : last.valueMn,
    rangeHigh: Math.max(...bars.map((b) => b.high)), rangeLow: Math.min(...bars.map((b) => b.low)),
    since: new Date(bars[0].time * 1000).toISOString().slice(0, 10), bars: bars.length,
  };
}

// Every share's last close, change on the day before, and volume, for the All shares list. Shares that
// stopped trading (last bar more than 14 days before the newest bar anywhere) are left out.
export function snapshot() {
  const d = load();
  const fm = fundamentals.meta();
  const newest = Math.max(...[...d.shares.values()].map((b) => b.at(-1).time));
  const out = [];
  for (const [t, bars] of d.shares) {
    const last = bars.at(-1), prev = bars.at(-2);
    if (newest - last.time > 14 * 86400) continue;
    out.push({
      symbol: `DSE:${t}`, ticker: t, price: last.close, volume: last.volume,
      changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : null,
      date: new Date(last.time * 1000).toISOString().slice(0, 10),
      ...(fm[t] || { name: null, sector: null, category: null }),
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

export async function candles(ticker, tf, limit, { adjusted = false } = {}) {
  const { t, bars, isIndex } = barsOf(ticker);
  if (parseTf(tf).seconds < 86400) {
    if (!["1h", "2h", "4h"].includes(tf)) throw bad("DSE has hourly bars (1h, 2h, 4h) and daily history; pick one of those.");
    if (isIndex) throw bad(`${t} has daily bars only. Hourly bars come per share.`);
    if (process.env.QT_OFFLINE === "1") throw bad("Hourly bars need StockNow, and offline mode is on.", 503);
    const bars = await hourly(t);
    return {
      symbol: `DSE:${t}`, tf, provider: "StockNow hourly", candles: resample(bars, tf).slice(-limit),
      notes: [`Hourly bars from StockNow: the last ${bars.length} of them, since ${new Date(bars[0].time * 1000).toISOString().slice(0, 10)}. Prices are the ones that traded; Adjusted does not apply here.`],
    };
  }
  const notes = [`Daily bars from your files in ${DSE_DIR}, last day ${new Date(bars.at(-1).time * 1000).toISOString().slice(0, 10)}.`];
  if (isIndex) notes.push(`${t} has a close only, so each bar opens at the previous close and has no wicks.`);
  const est = t === "DSEX" ? load().estimated : [];
  if (est.length) notes.push(`${est.length} DSEX days your files lack are estimated from the median share return (${est[0]} to ${est.at(-1)}).`);
  let all = bars;
  const l = isIndex ? null : await liveCached(t);
  if (l && l.time > bars.at(-1).time) {
    const day = await withToday(t, l);
    all = [...bars, day];
    notes.push(day.fromHourly
      ? "The last bar is today's session so far: the latest price from your Worker, with open, high, low and volume added up from StockNow's hourly bars."
      : "The last bar is today's live price from your Worker: it opens at the previous close and has no volume.");
  }
  let adjustedApplied = 0;
  if (adjusted && !isIndex) {
    // adjust the daily bars first and bucket after, so a week never mixes prices from either side of an ex-date
    const r = adjustBars(all, actionsFor(t));
    all = r.bars;
    adjustedApplied = r.applied;
    notes.push(r.applied
      ? `Prices are adjusted for ${r.applied} bonus, rights or split ex-date${r.applied > 1 ? "s" : ""}, so they differ from the prices that traded. The tester and replay use the traded prices.`
      : "Adjusted is on, but this share has no bonus, rights or split ex-date in these bars, so the prices are the same.");
  }
  return { symbol: `DSE:${t}`, tf, provider: "DSE files", candles: rebucket(all, tf).slice(-limit), notes, adjustedApplied };
}

// The Worker is asked at most once every 8 seconds per share, however many charts and refreshes ask.
const liveCache = new Map(); // CODE -> { at, v }
async function liveCached(t) {
  const hit = liveCache.get(t);
  if (hit && Date.now() - hit.at < 8000) return hit.v ? { ...hit.v } : null;
  const v = await live(t);
  liveCache.set(t, { at: Date.now(), v });
  return v ? { ...v } : null;
}

// Today's bar, better than the Worker alone can make it: its open, high, low and volume from the hourly bars StockNow
// holds for the same Dhaka day. Without them (StockNow down, or no hourly bar yet) the Worker's bar stands as it is.
async function withToday(t, l) {
  if (process.env.QT_OFFLINE === "1") return l;
  try {
    const hb = (await hourly(t)).filter((h) => Math.floor((h.time + 6 * 3600) / 86400) * 86400 === l.time);
    if (!hb.length) return l;
    return { ...l, open: hb[0].open, high: Math.max(l.high, ...hb.map((h) => h.high)), low: Math.min(l.low, ...hb.map((h) => h.low)), volume: hb.reduce((s, h) => s + h.volume, 0), fromHourly: true };
  } catch {
    return l;
  }
}

// Bars as an OHLCV CSV the terminal's importer reads.
export function csvOf(ticker) {
  const { bars } = barsOf(ticker);
  const iso = (b) => new Date(b.time * 1000).toISOString().slice(0, 10);
  return ["date,open,high,low,close,volume", ...bars.map((b) => `${iso(b)},${b.open},${b.high},${b.low},${b.close},${b.volume}`)].join("\n") + "\n";
}
