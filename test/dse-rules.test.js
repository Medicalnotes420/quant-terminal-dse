import test from "node:test";
import assert from "node:assert/strict";
import { backtest } from "../public/lib/backtest.js";

const T0 = Date.UTC(2026, 10, 1) / 1000;
const flat = (n = 10, p = 100) => Array.from({ length: n }, (_, i) => ({ time: T0 + i * 86400, open: p, high: p, low: p, close: p, volume: 1000 }));
const always = [{ left: "close", op: ">", right: 0 }];
const base = { indicators: {}, entryLong: always, exitLong: always, positionPct: 100, slippagePct: 0 };

test("DSE: a sale waits for settlement, T+2 by default and T+3 for category Z", () => {
  assert.equal(backtest(flat(), base).trades[0].bars, 1);
  assert.equal(backtest(flat(), { ...base, market: "dse" }).trades[0].bars, 2);
  assert.equal(backtest(flat(), { ...base, market: "dse", settleBars: 3 }).trades[0].bars, 3);
});

test("DSE: a stop cannot fire before settlement, then fills at the gap open", () => {
  // Bought at bar 1's open. Price falls through the 5% stop on bar 2 and stays down: bar 2 is locked, so the sale is bar 3.
  const bars = flat(8).map((b, i) => (i < 2 ? b : { ...b, open: 85, high: 85, low: 85, close: 85 }));
  const strat = { ...base, stopLossPct: 5, exitLong: [{ left: "close", op: "<", right: 0 }] };
  const plain = backtest(bars, strat).trades[0];
  const dse = backtest(bars, { ...strat, market: "dse" }).trades[0];
  assert.equal(plain.exitTime, bars[2].time, "without the lock the stop fires on bar 2");
  assert.equal(dse.exitTime, bars[3].time, "with the lock it waits a bar");
  assert.ok(dse.exitPrice <= 85, "and fills at the gap, not at the stop");
});

test("DSE: no shorts", () => {
  const short = { indicators: {}, entryShort: always, exitShort: always, positionPct: 100, slippagePct: 0 };
  assert.ok(backtest(flat(), short).trades.length > 0);
  assert.equal(backtest(flat(), { ...short, market: "dse" }).trades.length, 0);
});

test("DSE: fee is at least 0.30%, whole shares, 0.10 tick", () => {
  const r = backtest(flat(10, 73.37), { ...base, market: "dse", feePct: 0.1 });
  const t = r.trades[0];
  assert.ok(Number.isInteger(t.qty));
  assert.ok(Math.abs(t.entryPrice * 10 - Math.round(t.entryPrice * 10)) < 1e-6);
  assert.ok(t.entryPrice >= 73.37 && t.exitPrice <= 73.37, "buys round up, sells round down");
  assert.match(r.stats.feesAndSlippage, /0\.3% fee/);
});

test("DSE: a gap fill is held to 10% above the previous close", () => {
  const bars = flat(6);
  for (let i = 1; i < 6; i++) bars[i] = { ...bars[i], open: 130, high: 130, low: 130, close: 130 };
  const strat = { ...base, exitLong: [{ left: "close", op: "<", right: 0 }] };
  assert.ok(backtest(bars, strat).trades.length + 1 > 0);
  const dse = backtest(bars, { ...strat, market: "dse" });
  assert.ok(dse.equity.length === 6);
  const t = dse.trades[0];
  assert.ok(t.entryPrice <= 110.0001, `entry ${t.entryPrice}`);
});
