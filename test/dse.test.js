import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qt-dse-"));
process.env.QT_DSE_DIR = dir;
process.env.QT_DSE_WORKER = "off";
process.env.QT_FUND_DIR = path.join(dir, "no-fundamentals"); // none: the tests below use their own
fs.writeFileSync(path.join(dir, "actions.csv"), "ticker,date,ratio\nABC,2026-11-02,2\n");
process.env.QT_DSE_ACTIONS = path.join(dir, "actions.csv");
const H = "date,ticker,open,high,low,close,trades,value_mn,volume\n";
// ABC is in both files with different closes on 2026-11-02: the share-specific file must win.
// 2026-11-03 has zero trades (DSE repeats the close): it is not a bar.
fs.writeFileSync(path.join(dir, "dayend_ABC_x.csv"), H + [
  "2026-11-01,ABC,10,11,9,10.5,5,1,100", "2026-11-02,ABC,10.5,12,10,11,5,1,100", "2026-11-03,ABC,11,11,11,11,0,0,0",
].join("\n"));
fs.writeFileSync(path.join(dir, "dayend_stocknow_y.csv"), H + [
  "2026-11-02,ABC,10.5,12,10,99,5,1,100", "2026-11-04,ABC,11,13,10.8,12,5,1,100", "2026-11-04,XYZ,5,6,4,5.5,2,1,50",
].join("\n"));
fs.writeFileSync(path.join(dir, "market_summary_z.csv"), "date,dsex,ds30,total_volume\n2026-11-01,5000,2000,10\n2026-11-02,5100,2050,20\n");
// 25 shares that each close 100, 102, 101.02 on 2 to 4 Nov: median returns +2% and -0.98%. DSEX is missing on 3 and 4 Nov.
const bulk = [];
for (let i = 0; i < 25; i++)
  for (const [d, c] of [["2026-11-02", 100], ["2026-11-03", 102], ["2026-11-04", 101.02]]) bulk.push(`${d},T${String(i).padStart(2, "0")},${c},${c},${c},${c},3,1,100`);
fs.writeFileSync(path.join(dir, "dayend_stocknow_bulk.csv"), H + bulk.join("\n"));
const dse = await import("../lib/dse.js");

test("a share's bars merge the files, prefer the share file, and skip no-trade days", async () => {
  const r = await dse.candles("abc", "1D", 100);
  assert.equal(r.symbol, "DSE:ABC");
  assert.deepEqual(r.candles.map((b) => b.close), [10.5, 11, 12]);
  assert.equal(r.candles[0].time, Date.UTC(2026, 10, 1) / 1000);
});

test("an index has a close only: each bar opens at the previous close", async () => {
  const { candles } = await dse.candles("DSEX", "1D", 100);
  assert.deepEqual(candles.slice(0, 2).map((b) => [b.open, b.high, b.low, b.close]), [[5000, 5000, 5000, 5000], [5000, 5100, 5000, 5100]]);
});

test("DSEX days missing from the files are chained from the median share return, and flagged", async () => {
  const r = await dse.candles("DSEX", "1D", 100);
  const c = r.candles.map((b) => b.close);
  assert.equal(c.length, 4);
  assert.ok(Math.abs(c[2] - 5100 * 1.02) < 1e-6, `3 Nov ${c[2]}`);
  assert.ok(Math.abs(c[3] - 5100 * 1.02 * (101.02 / 102)) < 1e-6, `4 Nov ${c[3]}`);
  assert.match(r.notes.join(" "), /2 DSEX days .* estimated/);
  assert.doesNotMatch((await dse.candles("DS30", "1D", 100)).notes.join(" "), /estimated/);
});

test("weekly bars are built from the daily ones, intraday is refused", async () => {
  const w = await dse.candles("ABC", "1W", 100);
  // 1 Nov 2026 is a Sunday: the Sunday-to-Thursday week holds all three days, and starts on that Sunday.
  assert.equal(w.candles.length, 1);
  assert.equal(w.candles[0].time, Date.UTC(2026, 10, 1) / 1000);
  await assert.rejects(dse.candles("ABC", "1h", 10), /daily/);
});

test("an unknown code is a 404 that names it", async () => {
  await assert.rejects(dse.candles("NOPE", "1D", 10), (e) => e.status === 404 && /NOPE/.test(e.message));
});

test("tickers lists indices then shares, and the CSV export has one row per bar", () => {
  const t = dse.tickers();
  assert.deepEqual([t.slice(0, 3), t.at(-1), t.length], [["DSEX", "DS30", "ABC"], "XYZ", 2 + 1 + 25 + 1]);
  assert.equal(dse.csvOf("ABC").trim().split("\n").length, 4);
});

test("snapshot lists each share's last close and day change, and leaves stopped shares out", () => {
  const s = dse.snapshot();
  const abc = s.find((r) => r.ticker === "ABC");
  assert.equal(abc.symbol, "DSE:ABC");
  assert.equal(abc.price, 12);
  assert.ok(Math.abs(abc.changePct - ((12 - 11) / 11) * 100) < 1e-9);
  assert.equal(abc.date, "2026-11-04");
  assert.ok(s.every((r) => !r.ticker.startsWith("DSE")), "indexes are not shares");
  assert.deepEqual(s.map((r) => r.ticker), [...s.map((r) => r.ticker)].sort());
});

test("detail gives the last bar, the day change and the range since the first bar", () => {
  const d = dse.detail("abc");
  assert.equal(d.symbol, "DSE:ABC");
  assert.equal(d.close, 12);
  assert.equal(d.prevClose, 11);
  assert.equal(d.rangeHigh, 13);
  assert.equal(d.rangeLow, 9);
  assert.equal(d.since, "2026-11-01");
  assert.equal(d.trades, undefined, "the trade count is not shown: StockNow writes 1 for it");
  assert.equal(d.valueMn, 1);
  assert.equal(dse.detail("DSEX").isIndex, true);
  assert.throws(() => dse.detail("NOPE"), /isn't in your DSE files/);
});

test("adjusted candles divide earlier prices by the ratio and never touch the raw bars", async () => {
  const adj = await dse.candles("ABC", "1D", 100, { adjusted: true });
  assert.deepEqual(adj.candles.map((b) => b.close), [5.25, 11, 12]);
  assert.equal(adj.adjustedApplied, 1);
  assert.match(adj.notes.join(" "), /adjusted for 1 bonus/);
  const raw = await dse.candles("ABC", "1D", 100);
  assert.deepEqual(raw.candles.map((b) => b.close), [10.5, 11, 12]);
  assert.equal(raw.adjustedApplied, 0);
  const none = await dse.candles("XYZ", "1D", 100, { adjusted: true });
  assert.equal(none.adjustedApplied, 0);
  assert.match(none.notes.join(" "), /no bonus, rights or split/);
});
