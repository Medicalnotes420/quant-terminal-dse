// Back-adjust DSE prices for bonus, rights and split ex-dates, the way Stockapp's dse_quant/data/adjust.py does it:
// a bar dated before an ex-date has its prices multiplied by 1/ratio and its volume divided by that factor.
// The ratio is the price multiple across the ex-date (2.0 = a 1:1 bonus). Cash dividends are not adjusted.
import fs from "node:fs";

import path from "node:path";
import { fileURLToPath } from "node:url";
const STOCKAPP = fileURLToPath(new URL("../../Stockapp/", import.meta.url)); // the Stockapp folder next to this one
export const ACTIONS_FILE = process.env.QT_DSE_ACTIONS || path.join(STOCKAPP, "data/clean/actions.csv");

// New bars, same order; the input is never changed, so the cached raw bars stay raw.
// actions: [{ time, ratio }], time = the ex-date at UTC midnight in seconds. Returns { bars, applied }, applied = how
// many ex-dates changed the bars (one at or before the first bar changes nothing).
export function adjustBars(bars, actions) {
  const ex = (actions || []).filter((a) => a.ratio > 0 && a.time > bars[0]?.time).sort((a, b) => b.time - a.time);
  if (!ex.length) return { bars: bars.map((b) => ({ ...b })), applied: 0 };
  const out = new Array(bars.length);
  let f = 1, k = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    // an ex-date strictly after this bar's date applies to it
    while (k < ex.length && ex[k].time > bars[i].time) f /= ex[k++].ratio;
    const b = bars[i];
    out[i] = { ...b, open: b.open * f, high: b.high * f, low: b.low * f, close: b.close * f, volume: Math.round(b.volume / f) };
  }
  return { bars: out, applied: ex.length };
}

let cache = null;
// { TICKER: [{ time, ratio }] } from actions.csv (ticker,date,ratio); empty when the file isn't there.
export function actionsFor(ticker) {
  let st;
  try {
    st = fs.statSync(ACTIONS_FILE);
  } catch {
    return [];
  }
  if (cache?.mtime !== st.mtimeMs) {
    const by = {};
    for (const line of fs.readFileSync(ACTIONS_FILE, "utf8").split(/\r?\n/).slice(1)) {
      const [t, d, r] = line.split(",");
      const time = Date.parse(`${d}T00:00:00Z`) / 1000, ratio = Number(r);
      if (t && Number.isFinite(time) && ratio > 0) (by[t.toUpperCase()] ||= []).push({ time, ratio });
    }
    cache = { mtime: st.mtimeMs, by };
  }
  return cache.by[String(ticker).toUpperCase()] || [];
}
