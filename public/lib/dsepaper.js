// DSE rules for the paper account: long only, whole shares on the 0.10 tick, fee at least 0.30%, and shares
// can't be sold until they settle (T+2 trading days, or T+3 for category Z: set the account's dseLag).
// Pure functions, so they run in the browser and in tests. Position lots are { qty, time(ms) }, oldest first.

export const MIN_FEE_PCT = 0.3;
export const isDse = (sym) => /^(DSE:|CSV:DSE_)/.test(String(sym || ""));

// DSE holidays, from dse.com.bd/holidays (read 2026-11-20). Moon-dependent days may shift by a day.
// shortcut: 2027 is the cabinet's gazetted list (Prothom Alo, 2026-11-05), not DSE's own, which is not out yet. It has no
// bank-closing days (2026 had 07-01 and 12-31) and no Hill-districts-only 04-13. Replace it from dse.com.bd/holidays in December.
const HOLIDAYS = new Set([
  "2026-02-04", "2026-02-11", "2026-02-12", "2026-02-21", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20",
  "2026-03-21", "2026-03-22", "2026-03-23", "2026-03-26", "2026-04-14", "2026-05-01", "2026-05-25", "2026-05-26",
  "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-05-31", "2026-06-26", "2026-07-01", "2026-08-05",
  "2026-08-26", "2026-09-04", "2026-10-20", "2026-10-21", "2026-10-22", "2026-12-16", "2026-12-25", "2026-12-31",
  "2027-01-24", "2027-02-21", "2027-03-05", "2027-03-07", "2027-03-08", "2027-03-09", "2027-03-10", "2027-03-11",
  "2027-03-12", "2027-03-26", "2027-04-14", "2027-05-01", "2027-05-15", "2027-05-16", "2027-05-17", "2027-05-18",
  "2027-05-19", "2027-05-20", "2027-06-16", "2027-08-05", "2027-08-15", "2027-08-25", "2027-10-09", "2027-10-10",
  "2027-11-07", "2027-12-16", "2027-12-25",
]);

const DAY = 86400e3;
const dhakaDay = (ms) => Math.floor((ms + 6 * 3600e3) / DAY); // Dhaka is UTC+6, whole days since 1970-01-01
const iso = (d) => new Date(d * DAY).toISOString().slice(0, 10);
const weekday = (d) => (d + 4) % 7; // 1970-01-01 was a Thursday; 0 = Sunday
const trading = (d) => weekday(d) !== 5 && weekday(d) !== 6 && !HOLIDAYS.has(iso(d));

// Trading days after the day of `fromMs`, up to and including the day of `toMs`.
export function tradingDaysBetween(fromMs, toMs) {
  let n = 0;
  for (let d = dhakaDay(fromMs) + 1; d <= dhakaDay(toMs); d++) if (trading(d)) n++;
  return n;
}

// Shares that can be sold now. A position with no lots (made before DSE rules) counts as settled.
export function settledQty(pos, nowMs, lag = 2) {
  if (!pos?.lots) return Math.max(pos?.qty || 0, 0);
  return pos.lots.reduce((a, l) => a + (tradingDaysBetween(l.time, nowMs) >= lag ? l.qty : 0), 0);
}

export const snap = (x) => Math.round(x * 10) / 10;
const tick = (p, dir) => Math.round((dir > 0 ? Math.ceil(p / 0.1 - 1e-9) : Math.floor(p / 0.1 + 1e-9)) * 10) / 100;

// Is this order allowed? Returns { ok, qty, px } to fill, or { ok: false, error } to show.
export function check(acct, sym, side, qty, px, nowMs) {
  const q = Math.floor(qty + 1e-9);
  if (!(q >= 1)) return { ok: false, error: "DSE trades whole shares: that amount is less than one share." };
  const p = tick(px, side === "buy" ? 1 : -1);
  if (side === "sell") {
    const pos = acct.positions[sym];
    if (!(pos?.qty > 0)) return { ok: false, error: "DSE has no short selling: you hold no shares of this to sell." };
    const lag = acct.dseLag ?? 2;
    const ok = settledQty(pos, nowMs, lag);
    if (q > Math.floor(ok + 1e-9))
      return { ok: false, error: `Only ${Math.floor(ok)} of your ${pos.qty} shares are settled (T+${lag}, Fri/Sat and holidays skipped). Selling unsettled shares isn't allowed.` };
  }
  return { ok: true, qty: q, px: p };
}

// Call after a fill has updated acct.positions[sym]: keeps the lots in step (buys add one, sells use the oldest).
export function track(acct, sym, side, qty, nowMs, prevLots) {
  const pos = acct.positions[sym];
  if (!pos) return;
  const before = pos.qty - (side === "buy" ? qty : -qty);
  const lots = (prevLots || [{ qty: before, time: 0 }]).map((l) => ({ ...l }));
  if (side === "buy") lots.push({ qty, time: nowMs });
  else {
    let left = qty;
    for (const l of lots) {
      const take = Math.min(l.qty, left);
      l.qty -= take;
      left -= take;
    }
  }
  pos.lots = lots.filter((l) => l.qty > 1e-9);
}
