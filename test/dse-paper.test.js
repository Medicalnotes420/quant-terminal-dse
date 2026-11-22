import test from "node:test";
import assert from "node:assert/strict";
import * as d from "../public/lib/dsepaper.js";

// 2026-11-05 is a Thursday. Times are noon in Dhaka (06:00 UTC).
const at = (iso) => Date.parse(`${iso}T06:00:00Z`);
const acct = (lag) => ({ positions: {}, dseLag: lag });

test("trading days skip Friday and Saturday", () => {
  assert.equal(d.tradingDaysBetween(at("2026-11-05"), at("2026-11-08")), 1); // Thu -> Sun
  assert.equal(d.tradingDaysBetween(at("2026-11-05"), at("2026-11-09")), 2); // Thu -> Mon
  assert.equal(d.tradingDaysBetween(at("2026-11-05"), at("2026-11-07")), 0); // Thu -> Sat
});

test("trading days skip DSE holidays", () => {
  assert.equal(d.tradingDaysBetween(at("2026-10-19"), at("2026-10-23")), 0); // 20-22 Oct are Durga Puja, 23 is a Friday
  assert.equal(d.tradingDaysBetween(at("2026-10-19"), at("2026-10-25")), 1); // Sunday the 25th is the first
  assert.equal(d.tradingDaysBetween(at("2026-10-19"), at("2026-10-26")), 2);
});

test("a Thursday buy is sellable on Monday under T+2, and a Cat Z buy only on Tuesday", () => {
  const a = acct(2);
  a.positions.X = { qty: 100, avg: 10 };
  d.track(a, "X", "buy", 100, at("2026-11-05"), undefined);
  assert.equal(d.check(a, "X", "sell", 100, 10, at("2026-11-08")).ok, false);
  assert.match(d.check(a, "X", "sell", 100, 10, at("2026-11-08")).error, /settled/);
  assert.equal(d.check(a, "X", "sell", 100, 10, at("2026-11-09")).ok, true);
  const z = acct(3);
  z.positions.X = { qty: 100, avg: 10 };
  d.track(z, "X", "buy", 100, at("2026-11-05"), undefined);
  assert.equal(d.check(z, "X", "sell", 100, 10, at("2026-11-09")).ok, false);
  assert.equal(d.check(z, "X", "sell", 100, 10, at("2026-11-10")).ok, true);
});

test("only the settled lot can be sold, oldest first", () => {
  const a = acct(2);
  a.positions.X = { qty: 50, avg: 10 };
  d.track(a, "X", "buy", 50, at("2026-11-01"), undefined);
  a.positions.X.qty = 80;
  d.track(a, "X", "buy", 30, at("2026-11-09"), a.positions.X.lots);
  const now = at("2026-11-10");
  assert.equal(d.settledQty(a.positions.X, now, 2), 50);
  assert.equal(d.check(a, "X", "sell", 51, 10, now).ok, false);
  assert.equal(d.check(a, "X", "sell", 50, 10, now).ok, true);
  a.positions.X.qty = 30;
  d.track(a, "X", "sell", 50, now, a.positions.X.lots);
  assert.deepEqual(a.positions.X.lots.map((l) => l.qty), [30]);
});

test("no shorts, whole shares, and the 0.10 tick", () => {
  const a = acct();
  assert.match(d.check(a, "X", "sell", 10, 10, at("2026-11-09")).error, /no short/);
  assert.match(d.check(a, "X", "buy", 0.6, 10, 0).error, /whole shares/);
  const b = d.check(a, "X", "buy", 12.9, 73.37, 0);
  assert.deepEqual([b.qty, b.px], [12, 73.4]);
  a.positions.X = { qty: 12, avg: 73.4 };
  assert.equal(d.check(a, "X", "sell", 12, 73.37, 0).px, 73.3);
  assert.equal(d.MIN_FEE_PCT, 0.3);
});

test("a position with no lots (made before DSE rules) counts as settled", () => {
  assert.equal(d.settledQty({ qty: 40 }, 0, 2), 40);
});
