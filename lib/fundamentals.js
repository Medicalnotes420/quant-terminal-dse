// Company facts from the Stockapp weekly DSE snapshot (data/fundamentals/snapshot_YYYY-MM-DD.json.gz), read-only.
// The snapshot is a few days old: its own price is never shown as current. Sector, category and the yearly EPS and
// NAV are what the All shares filters and the Details panel use.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const FUND_DIR = process.env.QT_FUND_DIR || "../../Stockapp/data/fundamentals";

// The snapshot writes a missing value as the string "$undefined".
const clean = (v) =>
  v === "$undefined" ? null : Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v;

let cache = null;
export function load() {
  let files;
  try {
    files = fs.readdirSync(FUND_DIR).filter((f) => /^snapshot_.*\.json\.gz$/.test(f)).sort();
  } catch {
    return null;
  }
  if (!files.length) return null;
  const file = path.join(FUND_DIR, files.at(-1));
  const stamp = `${file}:${fs.statSync(file).mtimeMs}`;
  if (cache?.stamp === stamp) return cache;
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
  cache = { stamp, day: j.day, records: clean(j.records || {}) };
  return cache;
}

// DSE settles category Z shares in T+3 and every other category in T+2. Shown only: the paper rules own the real logic.
export const settlement = (category) => (category === "Z" ? "T+3" : category ? "T+2" : null);

// { CODE: { name, sector, category } } for the All shares list and its filters.
export function meta() {
  const d = load();
  const out = {};
  for (const [code, r] of Object.entries(d?.records || {})) out[code] = { name: r.name ?? null, sector: r.sector ?? null, category: r.category ?? null };
  return out;
}

// One company, trimmed to what the Details panel shows. Null when the share isn't in the snapshot (indexes, new listings).
export function company(code) {
  const d = load();
  const r = d?.records?.[String(code).toUpperCase()];
  if (!r) return null;
  const years = (r.multiYearFinancials || []).filter((y) => y && y.year != null).sort((a, b) => a.year - b.year);
  const latest = years.at(-1) || null;
  return {
    snapshotDay: d.day,
    name: r.name, sector: r.sector, category: r.category, settlement: settlement(r.category), board: r.board,
    listingYear: r.listingYear, yearEnd: r.yearEnd, agmDate: r.agmDate,
    faceValue: r.faceValue, paidUpCapital: r.paidUpCapital, freeFloat: r.freeFloat,
    shares: r.paidUpCapital && r.faceValue ? Math.round(r.paidUpCapital / r.faceValue) : null,
    eps: latest ? { year: latest.year, eps: latest.epsBasic ?? null, nav: latest.nav ?? null } : null,
    epsHistory: years.slice(-6).map((y) => ({ year: y.year, eps: y.epsBasic ?? null, nav: y.nav ?? null })),
    dividends: (r.dividendHistory || []).slice(0, 5).map((x) => ({ year: x.year, cash: x.cash ?? null, stock: x.stock ?? null })),
    news: (r.news || []).slice(0, 6).map((n) => ({ date: n.date, type: n.type, summary: n.summary, body: String(n.body || "").slice(0, 500) })),
  };
}
