// Two StockNow rules: hourly bars fetched before the 14:30 Dhaka close are not reused after it, and a daily chart does
// not wait on a slow StockNow (it gives up after 4 s and skips StockNow for that share for a minute).
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qt-dse-close-"));
process.env.QT_DSE_DIR = dir;
process.env.QT_FUND_DIR = path.join(dir, "no-fundamentals");
fs.writeFileSync(path.join(dir, "actions.csv"), "ticker,date,ratio\n");
process.env.QT_DSE_ACTIONS = path.join(dir, "actions.csv");
fs.writeFileSync(path.join(dir, "dayend_stocknow_a.csv"), "date,ticker,open,high,low,close,trades,value_mn,volume\n" +
  ["CLOSER", "SLOW"].map((t) => `2026-11-04,${t},20,21,19,20,5,1,100`).join("\n"));

const T0 = Date.UTC(2026, 10, 1, 4) / 1000;
let hourlyHits = 0;
const stocknow = http.createServer((req, res) => {
  hourlyHits++;
  const send = () => res.end(JSON.stringify([[10, 11], [11, 12], [9, 10], [10.5, 11.5], [100, 200], [T0, T0 + 3600]]));
  if (req.url.startsWith("/api/SLOW/")) return setTimeout(send, 6000);
  send();
});
await new Promise((r) => stocknow.listen(0, "127.0.0.1", r));
const worker = http.createServer((req, res) => {
  if (!req.url.includes("code=SLOW")) { res.writeHead(404); return res.end("{}"); }
  res.end(JSON.stringify({ ltp: 22.6, ycp: 20, high: 22.9, low: 20, fetchedAt: "2026-11-08T06:30:00Z" }));
});
await new Promise((r) => worker.listen(0, "127.0.0.1", r));
process.env.QT_DSE_WORKER = `http://127.0.0.1:${worker.address().port}`;
process.env.QT_STOCKNOW_URL = `http://127.0.0.1:${stocknow.address().port}/api`;
const dse = await import("../lib/dse.js");

test.after(() => { stocknow.closeAllConnections?.(); stocknow.close(); worker.close(); });

test("hourly bars fetched before the 14:30 close are fetched again after it, and cached again once it has passed", async () => {
  const at = (h, m, sec = 0) => Date.UTC(2026, 10, 8, h, m, sec); // 08:30 UTC is 14:30 in Dhaka; each step stays inside the minute's cache
  mock.timers.enable({ apis: ["Date"], now: at(8, 29, 40) });
  try {
    await dse.candles("CLOSER", "1h", 10);
    const first = hourlyHits;
    mock.timers.setTime(at(8, 29, 50));
    await dse.candles("CLOSER", "1h", 10);
    assert.equal(hourlyHits, first, "before the close, the minute's cache still serves");
    mock.timers.setTime(at(8, 30, 10));
    await dse.candles("CLOSER", "1h", 10);
    assert.equal(hourlyHits, first + 1, "after the close, the pre-close entry is not used");
    mock.timers.setTime(at(8, 30, 20));
    await dse.candles("CLOSER", "1h", 10);
    assert.equal(hourlyHits, first + 1, "the fresh entry is cached as usual");
  } finally {
    mock.timers.reset();
  }
});

test("a daily chart does not wait on a slow StockNow, and does not ask it again for a minute", async () => {
  let t = Date.now();
  const r = await dse.candles("SLOW", "1D", 10);
  const took = Date.now() - t;
  assert.ok(took >= 3500 && took < 5500, `gave up after about 4 s, took ${took} ms`);
  assert.equal(r.candles.at(-1).close, 22.6, "the Worker's bar stands");
  assert.ok(!r.candles.at(-1).fromHourly);
  t = Date.now();
  await dse.candles("SLOW", "1D", 10);
  assert.ok(Date.now() - t < 1000, "the second chart does not wait at all");
});
