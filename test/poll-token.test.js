// A live-poll tick that is still waiting on the network when the chart changes must not merge its answer into the
// new chart or start a second chain of ticks. Runs the chart's own poll methods against a stand-in with a hand-held fetch.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

globalThis.window = { LightweightCharts: {} };
globalThis.document = { documentElement: { dataset: {} }, createElement: () => ({}), querySelector: () => null, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { ChartPane } = await import("../public/js/chart.js");

const flush = () => new Promise((r) => setImmediate(r));
const SUNDAY_11AM_DHAKA = Date.UTC(2026, 10, 8, 5, 0); // the session is open

function setup(symbol) {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: SUNDAY_11AM_DHAKA });
  const waiting = [];
  globalThis.fetch = () => new Promise((resolve) => waiting.push(() => resolve({ ok: true, text: async () => JSON.stringify({ candles: [{ time: 1, close: 1 }] }) })));
  const merged = [];
  const pane = { cfg: { symbol, tf: "1D" }, liveOn: false, liveRun: null, liveTimer: null, updateLegend() {}, merge: (c) => merged.push(c) };
  return { pane, waiting, merged };
}

for (const [name, symbol, method] of [["DSE", "DSE:ABC", "pollDse"], ["other exchanges", "NASDAQ:AAPL", "poll"]]) {
  test(`${name}: a tick that finishes after stopLive neither merges nor schedules another`, async () => {
    const { pane, waiting, merged } = setup(symbol);
    try {
      ChartPane.prototype[method].call(pane);
      mock.timers.tick(60000); // the first tick fires and asks for bars
      await flush();
      assert.equal(waiting.length, 1, "the tick is waiting on the network");
      ChartPane.prototype.stopLive.call(pane);
      waiting[0]();
      await flush();
      assert.equal(merged.length, 0, "the late answer is dropped");
      assert.equal(pane.liveTimer, null, "and no new timer was set");
    } finally {
      mock.timers.reset();
    }
  });

  test(`${name}: without stopLive the same tick merges and keeps polling`, async () => {
    const { pane, waiting, merged } = setup(symbol);
    try {
      ChartPane.prototype[method].call(pane);
      mock.timers.tick(60000);
      await flush();
      waiting[0]();
      await flush();
      assert.equal(merged.length, 1);
      assert.notEqual(pane.liveTimer, null);
      ChartPane.prototype.stopLive.call(pane);
    } finally {
      mock.timers.reset();
    }
  });
}
