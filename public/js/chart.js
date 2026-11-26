// One chart: candles + volume + any number of indicators, drawings, compare symbols, replay and live data.
import { api, fmtPrice, fmtPct, fmtNum, esc, ticker, exchange } from "./api.js";
import { BY_ID, compute, periodKey } from "../lib/indicators.js";
import { reorder, withoutGroup, groupOf } from "../lib/panes.js";
import { isSessionOpen, pollDelayMs } from "../lib/session.js";
import {
  parseTf,
  isIntraday,
  heikinAshi,
  renko,
  lineBreak,
  rangeBars,
  kagi,
  pointFigure,
} from "../lib/series.js";
import { DrawingLayer, TOOL_BY_ID } from "./drawings.js";
import { VolumeProfile, SessionVolumeProfile } from "./volume-profile.js";
import { ChartPatterns, patternColour, passesFilter, patternEvents } from "./chart-patterns.js";

const LW = window.LightweightCharts;

export const CHART_TYPES = [
  ["candles", "Candles"],
  ["hollow", "Hollow candles"],
  ["bars", "Bars"],
  ["heikin", "Heikin Ashi"],
  ["line", "Line"],
  ["linemarkers", "Line with markers"],
  ["step", "Step line"],
  ["area", "Area"],
  ["baseline", "Baseline"],
  ["columns", "Columns"],
  ["renko", "Renko"],
  ["linebreak", "Line break"],
  ["range", "Range bars"],
  ["kagi", "Kagi"],
  ["pnf", "Point & figure"],
];
// Chart types built from price alone, with no meaningful volume per bar.
const PRICE_ONLY = ["renko", "linebreak", "kagi", "pnf"];
const BINANCE_WS_TF = {
  "1s": "1s",
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "6h": "6h",
  "8h": "8h",
  "12h": "12h",
  "1D": "1d",
  "3D": "3d",
  "1W": "1w",
  "1M": "1M",
};
const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  max: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  restore: '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
};
const PATTERN_SHORT = { trendline_break: "Trend break", swing_breakout: "Swing break" };
const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let uidSeq = 0;
export const newUid = () =>
  `i${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

// A chart line can't skip a blank point: it joins the neighbours. A segment takes the colour of
// the point it starts from, so hiding a gap means making the point before it transparent and
// parking the gap's points (invisibly) at the next real value.
const CLEAR = "rgba(0,0,0,0)";
function lineData(vals, breaks, timeAt, n) {
  const out = [];
  const next = new Array(vals.length);
  let nv = NaN;
  for (let i = vals.length - 1; i >= 0; i--) { if (Number.isFinite(vals[i])) nv = vals[i]; next[i] = nv; }
  let started = false;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i], time = timeAt(i);
    if (!Number.isFinite(v)) {
      if (i >= n) continue;
      out.push(started && Number.isFinite(next[i]) ? { time, value: next[i], color: CLEAR } : { time });
      continue;
    }
    started = true;
    const gapAhead = i + 1 < vals.length && (!Number.isFinite(vals[i + 1]) || breaks?.[i + 1]);
    out.push(gapAhead ? { time, value: v, color: CLEAR } : { time, value: v });
  }
  return out;
}
function histData(vals, colors, timeAt, n) {
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (i >= n && !Number.isFinite(v)) continue;
    if (!Number.isFinite(v)) out.push({ time: timeAt(i) });
    else out.push(colors ? { time: timeAt(i), value: v, color: colors[i] } : { time: timeAt(i), value: v });
  }
  return out;
}

// Higher-timeframe values onto chart bars. A chart bar sees a higher-timeframe bar only once that
// bar has finished, except inside the newest one, where it shows the still-forming value (as
// TradingView does in real time).
function mapToChart(res, hb, htf, cb, ctf) {
  const hSec = parseTf(htf).seconds, cSec = parseTf(ctf).seconds;
  const end = (j) => (j + 1 < hb.length ? hb[j + 1].time : hb[j].time + hSec);
  const idx = new Array(cb.length).fill(-1);
  let j = -1;
  for (let i = 0; i < cb.length; i++) {
    const cEnd = cb[i].time + cSec;
    while (j + 1 < hb.length && end(j + 1) <= cEnd) j++;
    idx[i] = j + 1 === hb.length - 1 && cb[i].time >= hb[hb.length - 1].time ? hb.length - 1 : j;
  }
  const out = {};
  for (const [k, v] of Object.entries(res)) {
    if (k === "markers") continue;
    out[k] = Array.isArray(v) && v.length >= hb.length ? idx.map((x) => (x >= 0 ? v[x] : NaN)) : v;
  }
  return out;
}

export class ChartPane {
  constructor(app, el, cfg) {
    this.app = app;
    this.el = el;
    this.cfg = {
      symbol: "DSE:DSEX",
      tf: "1D",
      type: "candles",
      indicators: [],
      compare: [],
      log: false,
      ...cfg,
    };
    this.bars = [];
    this.shown = [];
    this.times = [];
    this.indSeries = new Map();
    this.indResults = {};
    this.compareSeries = new Map();
    this.extraMarkers = [];
    this.replay = null;
    this.paneGroups = []; // uids of the indicators in each lower pane, set while drawing
    this.patternList = []; // every pattern the All Chart Patterns indicator found, with a key, hidden ones included
    this.patternPrim = null;
    this.patternInd = null; // the indicator that produced them
    this.selectedPattern = null; // a key
    this.maxUid = null; // the lower pane (by its first indicator) that fills the chart, or null
    el.innerHTML =
      '<div class="chart"></div><div class="legend"></div><div class="pane-tools"></div><div class="pane-actions"></div><div class="pat-tip hidden"></div><div class="pane-msg hidden"></div>';
    this.chartEl = el.querySelector(".chart");
    this.legendEl = el.querySelector(".legend");
    this.msgEl = el.querySelector(".pane-msg");
    this.tipEl = el.querySelector(".pat-tip");
    this.toolsEl = el.querySelector(".pane-tools");
    this.actionsEl = el.querySelector(".pane-actions");
    this.toolsEl.onclick = (e) => this.paneTool(e);
    this.actionsEl.onclick = (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act) app.paneAction(this, act);
    };
    this.createChart();
    // headers follow the pane heights: on resize, and after a separator is dragged
    new ResizeObserver(() => this.positionPaneTools()).observe(this.chartEl);
    this.chartEl.addEventListener("mouseup", () => requestAnimationFrame(() => this.positionPaneTools()));
    el.addEventListener("mousedown", () => app.setActive(this), true);
  }

  // ---------- setup ----------
  themeOptions() {
    return {
      layout: {
        background: { type: "solid", color: css("--bg") },
        textColor: css("--text"),
        fontSize: 11,
        panes: {
          separatorColor: css("--border"),
          separatorHoverColor: css("--accent-soft"),
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: css("--grid") },
        horzLines: { color: css("--grid") },
      },
      rightPriceScale: { borderColor: css("--border") },
      timeScale: { borderColor: css("--border") },
    };
  }

  createChart() {
    this.chart = LW.createChart(this.chartEl, {
      autoSize: true,
      ...this.themeOptions(),
      crosshair: { mode: LW.CrosshairMode.Normal },
      timeScale: {
        borderColor: css("--border"),
        rightOffset: 8,
        timeVisible: true,
        secondsVisible: false,
      },
      localization: { priceFormatter: (p) => fmtPrice(p) },
    });
    this.chart.subscribeCrosshairMove((p) => this.onCrosshair(p));
    this.chart.subscribeClick((p) => {
      if (this.app.tool !== "cursor") return;
      // a click on a chart pattern selects it; a click anywhere else lets go of it and carries on as before
      const key = p.point && this.patternPrim ? this.patternPrim.hit(p.point.x, p.point.y) : null;
      if (key) return this.selectPattern(key, p.point);
      if (this.selectedPattern) this.selectPattern(null);
      this.onClick(p);
    });
    // Lightweight Charts drops a second click that lands within 500ms of the first (it waits for a
    // double-click), so drawing tools read native clicks instead.
    this.chartEl.addEventListener("click", (e) => {
      if (this.app.tool === "cursor") return;
      const r = this.chartEl.getBoundingClientRect();
      const x = e.clientX - r.left,
        y = e.clientY - r.top;
      const inPlot =
        x >= 0 &&
        x <= this.chart.timeScale().width() &&
        y >= 0 &&
        y <= this.chart.panes()[0].getHeight();
      this.onClick({
        point: inPlot ? { x, y } : undefined,
        logical: inPlot ? this.chart.timeScale().coordinateToLogical(x) : null,
        paneIndex: 0,
      });
    });
    // Brush: press, drag, release. Drawing tools turn chart scrolling off, so the drag does not pan.
    const domP = (e) => {
      const r = this.chartEl.getBoundingClientRect();
      const x = e.clientX - r.left,
        y = e.clientY - r.top;
      const inPlot = x >= 0 && x <= this.chart.timeScale().width() && y >= 0 && y <= this.chart.panes()[0].getHeight();
      return { point: inPlot ? { x, y } : undefined, logical: inPlot ? this.chart.timeScale().coordinateToLogical(x) : null, paneIndex: 0 };
    };
    this.chartEl.addEventListener("mousedown", (e) => {
      if (this.app.tool !== "brush" || e.button !== 0) return;
      const pt = this.pointAt(domP(e));
      if (pt) this.drawings.temp = { id: newUid(), type: "brush", points: [pt] };
    });
    this.chartEl.addEventListener("mousemove", (e) => {
      const t = this.drawings.temp;
      if (this.app.tool !== "brush" || t?.type !== "brush" || t.points.length >= 600) return;
      const pt = this.pointAt(domP(e));
      if (pt) {
        t.points.push(pt);
        this.drawings.update();
      }
    });
    document.addEventListener("mouseup", () => {
      const t = this.drawings.temp;
      if (t?.type !== "brush") return;
      this.drawings.temp = null;
      if (t.points.length > 1) {
        this.drawings.items.push(t);
        this.drawings.selected = t;
        this.app.saveDrawings(this.cfg.symbol, this.drawings.items);
      }
      this.drawings.update();
    });
    // Drag a drawing: grab a handle to move that point, or the line itself to move the whole drawing.
    this.chartEl.addEventListener("mousedown", (e) => {
      if (this.app.tool !== "cursor" || e.button !== 0) return;
      const p = domP(e);
      const start = this.pointAt(p);
      const d = this.drawings;
      const item = start && d.hitTest(p.point.x, p.point.y);
      if (!item) return;
      d.selected = item;
      const handle = item.type === "brush" ? -1 : item.points.findIndex((q) => Math.hypot(d.x(q.time) - p.point.x, d.y(q.price) - p.point.y) < 8);
      this._drag = { item, handle, start, orig: structuredClone(item.points), moved: false };
      this.chart.applyOptions({ handleScroll: false, handleScale: false });
      e.stopPropagation();
    }, true);
    document.addEventListener("mousemove", (e) => {
      const g = this._drag;
      const cur = g && this.pointAt(domP(e));
      if (!cur) return;
      const dt = cur.time - g.start.time,
        dp = cur.price - g.start.price;
      g.item.points = g.orig.map((q, i) => (g.handle < 0 || g.handle === i ? { ...q, time: q.time + dt, price: q.price + dp } : q));
      g.moved = true;
      this.drawings.update();
    });
    document.addEventListener("mouseup", () => {
      const g = this._drag;
      if (!g) return;
      this._drag = null;
      this.chart.applyOptions({ handleScroll: true, handleScale: true });
      if (g.moved) this.app.saveDrawings(this.cfg.symbol, this.drawings.items);
    });
    this.drawings = new DrawingLayer(this);
    this.makeMainSeries();
  }

  applyTheme() {
    this.chart.applyOptions(this.themeOptions());
    this.render(false);
  }

  makeMainSeries() {
    for (const vp of this.vpPrims || []) { try { this.main?.detachPrimitive(vp); } catch { /* gone */ } }
    this.vpPrims = [];
    if (this.main) {
      this.main.detachPrimitive(this.drawings);
      this.chart.removeSeries(this.main);
    }
    if (this.volume) {
      this.chart.removeSeries(this.volume);
      this.volume = null;
    }
    if (this.volMA) {
      this.chart.removeSeries(this.volMA);
      this.volMA = null;
    }
    const up = css("--up"),
      down = css("--down"),
      accent = css("--accent");
    const t = this.cfg.type;
    const common = { priceLineVisible: true, lastValueVisible: true };
    if (t === "bars")
      this.main = this.chart.addSeries(LW.BarSeries, {
        ...common,
        upColor: up,
        downColor: down,
      });
    else if (["line", "linemarkers", "step", "kagi"].includes(t))
      this.main = this.chart.addSeries(LW.LineSeries, {
        ...common,
        color: accent,
        lineWidth: 2,
        lineType: t === "step" || t === "kagi" ? 1 : 0,
        pointMarkersVisible: t === "linemarkers",
      });
    else if (t === "area")
      this.main = this.chart.addSeries(LW.AreaSeries, {
        ...common,
        lineColor: accent,
        topColor: "rgba(41,98,255,0.35)",
        bottomColor: "rgba(41,98,255,0.02)",
        lineWidth: 2,
      });
    else if (t === "baseline")
      this.main = this.chart.addSeries(LW.BaselineSeries, {
        ...common,
        topLineColor: up,
        bottomLineColor: down,
        topFillColor1: "rgba(8,153,129,0.25)",
        topFillColor2: "rgba(8,153,129,0.02)",
        bottomFillColor1: "rgba(242,54,69,0.02)",
        bottomFillColor2: "rgba(242,54,69,0.25)",
      });
    else if (t === "columns")
      this.main = this.chart.addSeries(LW.HistogramSeries, { ...common });
    else if (t === "hollow")
      this.main = this.chart.addSeries(LW.CandlestickSeries, {
        ...common,
        upColor: "rgba(0,0,0,0)",
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
        borderVisible: true,
      });
    else
      this.main = this.chart.addSeries(LW.CandlestickSeries, {
        ...common,
        upColor: up,
        downColor: down,
        borderVisible: false,
        wickUpColor: up,
        wickDownColor: down,
      });
    this.main.attachPrimitive(this.drawings);
    this.markers = LW.createSeriesMarkers(this.main, []);
    this.mainType = t;
    if (
      !PRICE_ONLY.includes(t) &&
      this.app.settings.volume !== false
    ) {
      this.volume = this.chart.addSeries(LW.HistogramSeries, {
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      // the 20-bar average of volume, on the same scale: bars above it are drawn stronger, bars below it fainter
      this.volMA = this.chart.addSeries(LW.LineSeries, {
        priceScaleId: "vol",
        color: "#ffb62e",
        lineWidth: 1.5,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      this.chart
        .priceScale("vol")
        .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    }
  }

  // ---------- time helpers (drawings, legend, markers all go through these) ----------
  get shift() {
    return isIntraday(this.cfg.tf) && !this.app.settings.utc
      ? -new Date().getTimezoneOffset() * 60
      : 0;
  }
  get step() {
    return this.times.length > 1
      ? this.times.at(-1) - this.times.at(-2)
      : parseTf(this.cfg.tf).seconds;
  }
  toChart(t) {
    return t + this.shift;
  }

  logicalOf(utc) {
    const T = this.times,
      t = utc + this.shift,
      n = T.length;
    if (!n) return null;
    if (t <= T[0]) return (t - T[0]) / this.step;
    if (t >= T[n - 1]) return n - 1 + (t - T[n - 1]) / this.step;
    let lo = 0,
      hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (T[m] <= t) lo = m;
      else hi = m;
    }
    return lo + (t - T[lo]) / (T[hi] - T[lo]);
  }

  timeOfLogical(l) {
    const T = this.times,
      n = T.length;
    if (!n) return null;
    let t;
    if (l <= 0) t = T[0] + l * this.step;
    else if (l >= n - 1) t = T[n - 1] + (l - (n - 1)) * this.step;
    else {
      const i = Math.floor(l);
      t = T[i] + (l - i) * (T[i + 1] - T[i]);
    }
    return t - this.shift;
  }

  timeToX(utc) {
    const l = this.logicalOf(utc);
    return l == null ? null : this.chart.timeScale().logicalToCoordinate(l);
  }

  formatPrice(v) {
    return fmtPrice(v);
  }

  // ---------- data ----------
  async load({ keepView = false } = {}) {
    const token = (this.loadToken = {});
    this.stopLive();
    this.showMsg(`Loading ${ticker(this.cfg.symbol)}…`);
    try {
      const limit = this.app.settings.bars || 3000;
      const r = await api.candles(this.cfg.symbol, this.cfg.tf, limit, !!this.cfg.adjusted);
      if (token !== this.loadToken) return;
      this.cfg.symbol = r.symbol;
      this.provider = r.provider;
      this.notes = r.notes || [];
      this.bars = r.candles;
      this.mtf = {};
      this.adjustedApplied = (r.adjustedApplied || 0) > 0; // true: these bars are not the prices that traded
      this.patternSignals = [];
      this.replay = null;
      this.el.querySelector(".replay-bar")?.remove();
      this.drawings.setItems(this.app.getDrawings(r.symbol));
      this.showMsg(
        this.bars.length ? "" : "No data for this symbol and timeframe.",
      );
      await this.loadCompare();
      this.render(!keepView);
      this.loadPatterns(); // not awaited: the first call per share can take a few seconds
      this.startLive();
      this.app.onPaneLoaded(this);
    } catch (e) {
      if (token !== this.loadToken) return;
      this.bars = [];
      this.render(true);
      this.showMsg(
        `Couldn't load ${esc(this.cfg.symbol)} on ${esc(this.cfg.tf)}.\n${esc(e.message)}`,
      );
    }
  }

  async loadCompare() {
    this.compareData = {};
    await Promise.all(
      this.cfg.compare.map(async (sym) => {
        try {
          this.compareData[sym] = (
            await api.candles(sym, this.cfg.tf, this.app.settings.bars || 3000)
          ).candles;
        } catch {
          this.compareData[sym] = [];
        }
      }),
    );
  }

  showMsg(text) {
    this.msgEl.classList.toggle("hidden", !text);
    this.msgEl.innerHTML = esc(text).replace(/\n/g, "<br>");
  }

  visibleBars() {
    const raw = this.replay
      ? this.bars.slice(0, this.replay.index + 1)
      : this.bars;
    switch (this.cfg.type) {
      case "heikin":
        return heikinAshi(raw);
      case "renko":
        return renko(raw);
      case "linebreak":
        return lineBreak(raw);
      case "range":
        return rangeBars(raw);
      case "kagi":
        return kagi(raw);
      case "pnf":
        return pointFigure(raw);
      default:
        return raw;
    }
  }

  pointFor(b) {
    const time = this.toChart(b.time);
    switch (this.mainType) {
      case "line":
      case "linemarkers":
      case "step":
      case "area":
      case "baseline":
        return { time, value: b.close };
      case "kagi":
        return { time, value: b.close, color: b.color };
      case "columns":
        return {
          time,
          value: b.close,
          color: b.close >= b.open ? css("--up") : css("--down"),
        };
      default: {
        const c = this.barColorAt?.get(b.time);
        return { time, open: b.open, high: b.high, low: b.low, close: b.close, ...(c ? (this.mainType === "bars" ? { color: c } : { color: c, borderColor: c, wickColor: c }) : {}) };
      }
    }
  }

  // up bars green, down bars red; stronger when the volume is above its 20-bar average, fainter when below
  volPoint(b, ma = null) {
    const strong = ma != null && (b.volume || 0) > ma;
    const a = ma == null ? 0.45 : strong ? 0.8 : 0.35;
    return {
      time: this.toChart(b.time),
      value: b.volume || 0,
      color: b.close >= b.open ? `rgba(8,153,129,${a})` : `rgba(242,54,69,${a})`, // the candle colours
    };
  }
  volMaPoint(bars, i) {
    const n = 20;
    if (i < n - 1) return { time: this.toChart(bars[i].time) };
    let sum = 0;
    for (let k = i - n + 1; k <= i; k++) sum += bars[k].volume || 0;
    return { time: this.toChart(bars[i].time), value: sum / n };
  }

  render(resetView) {
    const prevRange = this.chart.timeScale().getVisibleLogicalRange();
    const atEnd =
      prevRange && this.shown.length && prevRange.to >= this.shown.length - 3;
    if (
      this.mainType !== this.cfg.type ||
      !!this.volume !==
        (!PRICE_ONLY.includes(this.cfg.type) &&
          this.app.settings.volume !== false)
    )
      this.makeMainSeries();
    this.shown = this.visibleBars();
    this.times = this.shown.map((b) => this.toChart(b.time));
    const last = this.shown.at(-1)?.close || 1;
    const precision = last >= 100 ? 2 : last >= 1 ? 4 : last >= 0.01 ? 6 : 8;
    this.main.applyOptions({
      priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
    });
    if (this.cfg.type === "baseline" && this.shown.length)
      this.main.applyOptions({
        baseValue: {
          type: "price",
          price: this.shown[Math.max(0, this.shown.length - 150)].close,
        },
      });
    this.main.setData(this.shown.map((b) => this.pointFor(b)));
    if (this.volume) {
      const ma = this.shown.map((_, i) => this.volMaPoint(this.shown, i));
      this.volume.setData(this.shown.map((b, i) => this.volPoint(b, ma[i].value ?? null)));
      this.volMA?.setData(ma);
    }
    this.chart.applyOptions({
      timeScale: {
        timeVisible: isIntraday(this.cfg.tf),
        secondsVisible: parseTf(this.cfg.tf).seconds < 60,
      },
    });
    this.chart.priceScale("right").applyOptions({
      mode: this.cfg.compare.length
        ? LW.PriceScaleMode.Percentage
        : this.cfg.log
          ? LW.PriceScaleMode.Logarithmic
          : LW.PriceScaleMode.Normal,
    });
    this.renderCompare();
    this.renderIndicators();
    this.drawings.update();
    if (resetView && this.shown.length)
      this.chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, this.shown.length - 160),
        to: this.shown.length + 8,
      });
    if (!resetView && this.shown.length && (this.replay || atEnd)) {
      const w = prevRange ? Math.max(20, prevRange.to - prevRange.from) : 160;
      const n = this.shown.length;
      this.chart
        .timeScale()
        .setVisibleLogicalRange({ from: n - w + 8, to: n + 8 });
    }
    this.updateLegend();
  }

  renderCompare() {
    for (const s of this.compareSeries.values()) this.chart.removeSeries(s);
    this.compareSeries.clear();
    const palette = ["#ff9800", "#e91e63", "#00bcd4", "#8bc34a", "#9c27b0"];
    this.cfg.compare.forEach((sym, k) => {
      const data = (this.compareData?.[sym] || []).filter(
        (b) => !this.replay || b.time <= this.shown.at(-1)?.time,
      );
      const s = this.chart.addSeries(LW.LineSeries, {
        color: palette[k % palette.length],
        lineWidth: 2,
        priceLineVisible: false,
        title: ticker(sym),
      });
      s.setData(
        data.map((b) => ({ time: this.toChart(b.time), value: b.close })),
      );
      this.compareSeries.set(sym, s);
    });
  }

  // Indicator values for one instance: on the chart's bars, on another indicator's output
  // (source "ind:<uid>:<output>"), or on a higher timeframe mapped back without look-ahead.
  computeIndicator(ind, bars) {
    const src = String(ind.params?.source || "");
    if (ind.tf && ind.tf !== this.cfg.tf) {
      const h = this.mtf[ind.tf];
      if (!h) { this.loadMtf(ind.tf); return { pending: true }; }
      if (h.error) return { error: h.error };
      let hb = h.bars;
      if (this.replay && bars.length) {
        // replay: only higher-timeframe bars that had finished by the replayed bar
        const cEnd = bars.at(-1).time + parseTf(this.cfg.tf).seconds, hs = parseTf(ind.tf).seconds;
        hb = hb.filter((x, j) => (j + 1 < hb.length ? hb[j + 1].time : x.time + hs) <= cEnd);
      }
      if (!hb.length) return {};
      const res = compute(ind.id, hb, src.startsWith("ind:") ? { ...ind.params, source: "close" } : ind.params);
      return mapToChart(res, hb, ind.tf, bars, this.cfg.tf);
    }
    if (src.startsWith("ind:")) {
      const [, uid, key] = src.split(":");
      const vals = this.indResults[uid]?.[key];
      if (!Array.isArray(vals)) return { error: "Its source indicator is missing" };
      const synth = bars.map((x, i) => { const v = vals[i]; return { ...x, open: v, high: v, low: v, close: v }; });
      return compute(ind.id, synth, { ...ind.params, source: "close" });
    }
    return compute(ind.id, bars, ind.params);
  }

  async loadMtf(tf) {
    this.mtfLoading ||= {};
    if (this.mtfLoading[tf]) return;
    this.mtfLoading[tf] = true;
    try {
      if (parseTf(tf).seconds < parseTf(this.cfg.tf).seconds) throw new Error(`Pick a timeframe at or above the chart's (${this.cfg.tf})`);
      const r = await api.candles(this.cfg.symbol, tf, 2000);
      this.mtf[tf] = { bars: r.candles, at: Date.now() };
    } catch (e) {
      this.mtf[tf] = { error: e.message, at: Date.now() };
    }
    delete this.mtfLoading[tf];
    this.render(false);
  }

  renderIndicators() {
    for (const list of this.indSeries.values())
      for (const s of list) {
        try { this.chart.removeSeries(s); } catch { /* already gone */ }
      }
    this.indSeries.clear();
    for (const vp of this.vpPrims || []) { try { this.main.detachPrimitive(vp); } catch { /* gone with the series */ } }
    this.vpPrims = [];
    this.patternPrim = null;
    this.patternList = [];
    this.patternInd = null;
    while (this.chart.panes().length > 1) this.chart.removePane(this.chart.panes().length - 1);
    this.indResults = {};
    this.mtf ||= {};
    const bars = this.shown, n = bars.length;
    const timeAt = (i) => (i < n ? this.times[i] : this.times[n - 1] + (i - n + 1) * this.step);
    // indicators built on another indicator's output go after their source
    const byUid = new Map(this.cfg.indicators.map((x) => [x.uid, x]));
    const depth = (x, seen = new Set()) => {
      const src = String(x.params?.source || "");
      if (!src.startsWith("ind:") || seen.has(x.uid)) return 0;
      seen.add(x.uid);
      const parent = byUid.get(src.split(":")[1]);
      return parent ? 1 + depth(parent, seen) : 0;
    };
    const ordered = [...this.cfg.indicators].sort((x, y) => depth(x) - depth(y));
    let paneIdx = 0;
    const paneOf = {};
    const groups = [];
    const markers = [];
    const barColorAt = new Map();
    for (const ind of ordered) {
      const def = BY_ID[ind.id];
      if (!def) continue;
      let res;
      try { res = n ? this.computeIndicator(ind, bars) : {}; } catch (e) { res = { error: e.message }; }
      this.indResults[ind.uid] = res;
      if (ind.hidden || !n) continue;
      if (res.markers && !ind.tf) markers.push(...res.markers);
      if (Array.isArray(res.barColors) && !ind.tf)
        res.barColors.forEach((c, i) => c && i < n && barColorAt.set(bars[i].time, c));
      if (res.volumeProfile) {
        const vp = new VolumeProfile(this, res.volumeProfile);
        this.main.attachPrimitive(vp);
        this.vpPrims.push(vp);
      }
      if (res.chartPatterns) {
        // bar-index patterns only make sense on real bars: Renko, Kagi, Line break, Range, Point & figure and Heikin Ashi are rebuilt
        if (["renko", "linebreak", "range", "kagi", "pnf", "heikin"].includes(this.cfg.type)) res.error = "Not drawn on this chart type: use candles, bars or a line";
        else if (this.patternPrim) res.error = "Only the first All Chart Patterns indicator on a chart is drawn";
        else {
          // the first All Chart Patterns indicator on the chart drives the list, the selection and the switches
          this.patternList = res.chartPatterns.map((p) => ({ ...p, key: this.patternKey(p, bars) }));
          const cp = new ChartPatterns(this, this.patternList);
          cp.hidden = this.hiddenPatternSet(ind);
          this.checkPatternAlerts(ind);
          cp.selected = this.patternList.some((p) => p.key === this.selectedPattern) ? this.selectedPattern : null;
          if (!cp.selected) this.selectedPattern = null;
          this.main.attachPrimitive(cp);
          this.vpPrims.push(cp);
          this.patternPrim = cp;
          this.patternInd = ind;
        }
      }
      if (res.sessionProfile) {
        const sp = new SessionVolumeProfile(this, res.sessionProfile);
        sp.keyOf = periodKey;
        sp.tfSeconds = parseTf(this.cfg.tf).seconds;
        this.main.attachPrimitive(sp);
        this.vpPrims.push(sp);
      }
      const outs = def.outputs.filter((o) => Array.isArray(res[o.key]));
      if (!outs.length) continue;
      const src = String(ind.params?.source || "");
      const parentPane = src.startsWith("ind:") ? paneOf[src.split(":")[1]] : undefined;
      const pane = parentPane !== undefined ? parentPane : def.overlay ? 0 : ++paneIdx;
      paneOf[ind.uid] = pane;
      if (pane > 0) (groups[pane - 1] ||= []).push(ind.uid);
      const list = [];
      for (const out of outs) {
        const color = ind.colors?.[out.key] || out.color;
        const opts = {
          ...(def.noAutoscale ? { autoscaleInfoProvider: () => null } : {}),
          ...(def.volumeFormat ? { priceFormat: { type: "volume" } } : {}),
          color,
          priceLineVisible: false,
          lastValueVisible: pane > 0,
          crosshairMarkerVisible: false,
          title: "",
        };
        const s = out.kind === "histogram"
          ? this.chart.addSeries(LW.HistogramSeries, opts, pane)
          : this.chart.addSeries(LW.LineSeries, { ...opts, lineWidth: out.lineWidth || 1, ...(out.dots ? { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.5 } : {}) }, pane);
        const vals = res[out.key];
        s.setData(out.kind === "histogram" ? histData(vals, res.colors, timeAt, n) : lineData(vals, res.breaks, timeAt, n));
        list.push(s);
      }
      if (parentPane === undefined)
        for (const lv of def.levels || [])
          list[0].createPriceLine({ price: lv, color: css("--muted"), lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: false });
      this.indSeries.set(ind.uid, list);
    }
    // candle colours from indicators (Pine's barcolor), only on charts drawn from the real bars
    const recolor = ["candles", "hollow", "bars"].includes(this.cfg.type) ? barColorAt : new Map();
    if (recolor.size || this.barColorAt?.size) {
      this.barColorAt = recolor;
      this.main.setData(bars.map((b) => this.pointFor(b)));
    }
    this.paneGroups = groups.filter(Boolean);
    this.showPatternTip();
    this.app.onPatterns?.(this);
    if (this.maxUid && groupOf(this.paneGroups, this.maxUid) < 0) this.maxUid = null;
    const big = this.maxUid ? groupOf(this.paneGroups, this.maxUid) + 1 : -1;
    // a maximized lower pane takes the chart; the others shrink to a strip
    this.chart.panes().forEach((p, i) => p.setStretchFactor(big < 0 ? (i === 0 ? 1 : 0.28) : i === big ? 1 : 0.02));
    requestAnimationFrame(() => this.positionPaneTools());
    const all = (this.cfg.marks === false ? [] : [...markers, ...this.extraMarkers, ...(this.cfg.patterns ? this.patternMarkers() : [])])
      .map((m) => ({ ...m, time: this.toChart(m.time) }))
      .filter((m) => !this.replay || m.time <= this.times.at(-1));
    all.sort((x, y) => x.time - y.time);
    this.markers.setMarkers(all);
  }

  // Pattern signals from the Stockapp chart service. Date only: each lands on the bar that holds its day
  // (the day itself on 1D, the week or month bar above that), never at the service's adjusted prices.
  patternMarkers() {
    const bars = this.shown, groups = new Map();
    if (!bars.length) return [];
    const last = bars.at(-1).time + this.step;
    for (const s of this.patternSignals || []) {
      const t = Date.parse(`${s.date}T00:00:00Z`) / 1000;
      if (!(t >= bars[0].time && t < last)) continue;
      // on an hourly chart the signal belongs to the last bar of its day; on daily and slower, the bar holding the day
      const i = this.step < 86400 ? bars.findLastIndex((b) => b.time >= t && b.time < t + 86400) : bars.findLastIndex((b) => b.time <= t);
      if (i < 0) continue;
      const key = `${i}|${s.direction}`;
      const g = groups.get(key) || { time: bars[i].time, direction: s.direction, names: [] };
      g.names.push(s.pattern);
      groups.set(key, g);
    }
    return [...groups.values()].map((g) => {
      const up = g.direction === "bullish", down = g.direction === "bearish";
      return {
        time: g.time,
        position: up ? "belowBar" : "aboveBar",
        shape: up ? "arrowUp" : down ? "arrowDown" : "circle",
        // vivid on both themes, and short: the arrow already says which way, the text only says which signal
        color: up ? "#19e39a" : down ? "#ff5f73" : "#aeb3c2",
        text: g.names.map((n) => PATTERN_SHORT[n] || n).join(" + "),
        size: 1.3,
      };
    });
  }

  async loadPatterns() {
    this.patternSignals = [];
    if (this.cfg.patterns) {
      const token = this.loadToken;
      try {
        const r = await api.patterns(this.cfg.symbol);
        if (token !== this.loadToken) return;
        this.patternSignals = r.signals || [];
        if (r.error) this.app.toast(r.error, "err");
      } catch (e) {
        this.app.toast(e.message, "err");
      }
    }
    if (this.bars.length) this.render(false);
  }

  // "14 on RSI 14 (1D)": the numeric inputs, what it's built on, and its timeframe.
  indicatorParamsLabel(ind) {
    const def = BY_ID[ind.id];
    if (!def) return "";
    const nums = (def.inputs || [])
      .filter((x) => x.type !== "source")
      .map((x) => {
        const v = ind.params?.[x.key] ?? x.default;
        if (x.type !== "time") return v;
        return v ? new Date(v * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "pick a bar";
      })
      .join(" ");
    const src = String(ind.params?.source || "");
    let on = "";
    if (src.startsWith("ind:")) {
      const parent = this.cfg.indicators.find((x) => x.uid === src.split(":")[1]);
      const pd = parent && BY_ID[parent.id];
      on = pd ? ` on ${(/\(([^)]+)\)$/.exec(pd.name)?.[1].split(" / ")[0] || pd.name)} ${this.indicatorParamsLabel(parent)}` : " on (missing)";
    }
    return `${nums}${on}${ind.tf && ind.tf !== this.cfg.tf ? ` (${ind.tf})` : ""}`;
  }

  // ---------- legend ----------
  onCrosshair(p) {
    if (this.app.tool !== "cursor" && this.drawings.temp && p.point) {
      const pt = this.pointAt(p);
      if (pt) {
        this.drawings.temp.points[this.drawings.temp.points.length - 1] = pt;
        this.drawings.update();
      }
    }
    const i =
      p.logical != null && p.point
        ? Math.max(0, Math.min(this.shown.length - 1, Math.round(p.logical)))
        : null;
    this.updateLegend(i);
    if (this.app.settings.syncCrosshair && p.time && p.point)
      this.app.syncCrosshair(this, p);
  }

  updateLegend(index = null) {
    const n = this.shown.length;
    const i = index ?? n - 1;
    const b = this.shown[i],
      prev = this.shown[i - 1];
    const chg = b && prev ? ((b.close - prev.close) / prev.close) * 100 : null;
    const cls = chg == null ? "" : chg >= 0 ? "up" : "down";
    const name = `${ticker(this.cfg.symbol)} · ${this.cfg.tf} · ${this.provider || exchange(this.cfg.symbol)}`;
    let html = `<div class="row"><span class="title" data-act="symbol">${esc(name)}</span>${this.liveOn ? '<span class="live" title="The exchange is open: this chart refreshes by itself">● live</span>' : ""}`;
    if (b) {
      const day = this.step < 86400
        ? new Date(b.time * 1000).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : new Date(b.time * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
      const abs = prev ? b.close - prev.close : null;
      html += `<span class="ohlc ${cls}"><span class="when">${esc(day)}</span><span><b>O</b>${fmtPrice(b.open)}</span><span><b>H</b>${fmtPrice(b.high)}</span><span><b>L</b>${fmtPrice(b.low)}</span><span><b>C</b>${fmtPrice(b.close)}</span><span>${abs == null ? "" : `${abs >= 0 ? "+" : ""}${fmtPrice(abs)} `}${fmtPct(chg)}</span>${b.volume ? `<span class="vol"><b>Vol</b>${fmtNum(b.volume)}</span>` : ""}</span>`;
    }
    html += "</div>";
    for (const sym of this.cfg.compare) {
      html += `<div class="row ind" data-compare="${esc(sym)}"><span class="name">${esc(ticker(sym))} (compare)</span><span class="acts"><button data-act="rmcompare" title="Remove">${ICON.x}</button></span></div>`;
    }
    for (const ind of this.cfg.indicators) {
      const def = BY_ID[ind.id];
      if (!def) continue;
      const res = this.indResults[ind.uid] || {};
      const params = this.indicatorParamsLabel(ind);
      const vals = res.error
        ? `<span class="down">${esc(res.error)}</span>`
        : res.pending
          ? '<span class="muted">loading…</span>'
          : res.chartPatterns
            ? `<span class="muted">${res.chartPatterns.length ? `${res.chartPatterns.length} found` : "none in these bars"}</span>`
          : def.outputs
            .map((o) => {
              const v = res[o.key]?.[i];
              return Number.isFinite(v)
                ? `<span style="color:${ind.colors?.[o.key] || o.color}">${fmtPrice(v)}</span>`
                : "";
            })
            .join(" ");
      const short =
        /\(([^)]+)\)$/.exec(def.name)?.[1].split(" / ")[0] || def.name;
      html += `<div class="row ind" data-uid="${ind.uid}" style="${ind.hidden ? "opacity:.45" : ""}"><span class="name">${esc(short)} ${esc(params)}</span><span class="vals">${vals}</span><span class="acts"><button data-act="settings" title="Settings">${ICON.gear}</button><button data-act="hide" title="Show/hide">${ICON.eye}</button><button data-act="remove" title="Remove">${ICON.x}</button></span></div>`;
    }
    if (!this.cfg.indicators.some((x) => x.id === "chartpatterns"))
      html += `<div class="row ind"><span class="name muted">Chart patterns off</span><span class="acts"><button class="btn small" data-act="addpatterns">Add</button></span></div>`;
    this.legendEl.innerHTML = html;
    this.legendEl.onclick = (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "symbol") return this.app.openSymbolSearch();
      if (act === "addpatterns") return void this.addIndicator("chartpatterns");
      if (act === "rmcompare") {
        this.cfg.compare = this.cfg.compare.filter(
          (s) => s !== btn.closest("[data-compare]").dataset.compare,
        );
        this.app.persist();
        return this.load({ keepView: true });
      }
      const uid = btn.closest("[data-uid]")?.dataset.uid;
      const ind = this.cfg.indicators.find((x) => x.uid === uid);
      if (!ind) return;
      if (act === "remove") this.removeIndicator(uid);
      if (act === "hide") {
        ind.hidden = !ind.hidden;
        this.render(false);
        this.app.persist();
      }
      if (act === "settings") this.app.openIndicatorSettings(this, ind);
    };
  }

  // ---------- chart patterns: select one, read its levels, jump to it, switch it off ----------
  // A pattern has no id: it is named by its type and the times of its first and last points, which survive a reload
  // and the arrival of new bars (an index would not).
  patternKey(p, bars) {
    return `${p.type}|${bars[p.points[0].i]?.time}|${bars[p.points.at(-1).i]?.time}`;
  }
  patternByKey(key) {
    return this.patternList.find((p) => p.key === key) || null;
  }
  selectPattern(key, at = null) {
    this.selectedPattern = key;
    if (this.patternPrim) {
      this.patternPrim.selected = key;
      this.patternPrim.requestUpdate?.();
    }
    this.tipAt = key ? at : null;
    this.showPatternTip();
    this.app.onPatterns?.(this);
  }
  showPatternTip() {
    const p = this.selectedPattern && this.patternByKey(this.selectedPattern);
    const el = this.tipEl;
    if (!el) return;
    if (!p || this.patternPrim?.hidden.has(p.key)) {
      el.classList.add("hidden");
      return;
    }
    const when = (i) => {
      const t = this.shown[i]?.time;
      if (!t) return "—";
      const d = new Date(t * 1000).toISOString();
      return this.step < 86400 ? `${d.slice(0, 10)} ${d.slice(11, 16)}` : d.slice(0, 10);
    };
    const f = (v) => (v == null ? "—" : Number(v).toFixed(2));
    const risk = p.entry != null && p.stop != null ? Math.abs(p.entry - p.stop) : null;
    const reward = p.entry != null && p.target ? Math.abs(p.target.price - p.entry) : null;
    const dirText = p.dir === "bull" ? "Bullish: breaks up" : p.dir === "bear" ? "Bearish: breaks down" : "Neutral: breaks either way";
    el.style.setProperty("--pat", patternColour(p, document.documentElement.dataset.theme));
    el.innerHTML = `<div class="pt-head"><b>${esc(p.type)}</b><span class="pt-badge">${esc(p.status)}</span></div>
      <div class="pt-dir">${esc(dirText)}</div>
      <div class="pt-grid">
        <span>First point</span><span>${esc(when(p.points[0].i))}</span>
        <span>Last point</span><span>${esc(when(p.points.at(-1).i))}</span>
        <span>Broke out</span><span>${p.breakI == null ? "not yet" : esc(when(p.breakI))}</span>
        <span>Entry (break)</span><span>${f(p.entry)}</span>
        <span>Stop</span><span class="down">${f(p.stop)}</span>
        <span>Target</span><span class="up">${f(p.target?.price)}</span>
        <span>Risk / reward</span><span>${risk && reward ? `${f(risk)} / ${f(reward)} (${(reward / risk).toFixed(1)}R)` : "—"}</span>
      </div>
      <div class="pt-foot">Measured from the pattern's own size. A guide, not advice. Esc or click away to close.</div>`;
    el.classList.remove("hidden");
    // beside the click, kept inside the chart; or, when jumped to from the list, at the pattern's own label
    const r = this.el.getBoundingClientRect(), g = this.patternPrim?.geom.find((x) => x.key === p.key);
    const pill = g?.pills[0];
    const ax = this.tipAt?.x ?? (pill ? pill.x + 12 : 80), ay = this.tipAt?.y ?? (pill ? pill.y + 26 : 80);
    const w = el.offsetWidth || 230, h = el.offsetHeight || 190;
    // right of the click, or left of it when there is no room before the price scale; always inside the pane
    const plotW = this.chart.timeScale().width();
    const left = ax + 14 + w > plotW - 6 ? ax - w - 14 : ax + 14;
    el.style.left = `${Math.max(6, Math.min(r.width - w - 6, left))}px`;
    el.style.top = `${Math.max(6, Math.min(r.height - h - 8, ay + 14))}px`;
  }
  // Scroll and zoom so the whole pattern (its points, breakout and target line) is in view, then select it.
  jumpToPattern(key) {
    const p = this.patternByKey(key);
    if (!p) return;
    if (this.patternInd?.hiddenPatterns?.includes(key)) this.setPatternVisible(key, true);
    const last = Math.max(p.points.at(-1).i, p.breakI ?? 0, p.target?.toI ?? 0);
    const pad = Math.max(6, Math.round((last - p.points[0].i) * 0.25));
    this.chart.timeScale().setVisibleLogicalRange({ from: p.points[0].i - pad, to: Math.min(this.shown.length + 6, last + pad) });
    this.tipAt = null;
    this.selectPattern(key);
    requestAnimationFrame(() => requestAnimationFrame(() => this.showPatternTip())); // after the redraw has placed the label
  }
  // not drawn: the ones switched off by hand plus the ones the quality filter leaves out
  hiddenPatternSet(ind) {
    const hidden = new Set(ind.hiddenPatterns || []);
    for (const p of this.patternList) if (!passesFilter(p, ind.patFilter)) hidden.add(p.key);
    return hidden;
  }
  setPatternFilter(f) {
    const ind = this.patternInd;
    if (!ind) return;
    ind.patFilter = f;
    if (this.selectedPattern && !passesFilter(this.patternByKey(this.selectedPattern) || {}, f)) this.selectedPattern = null;
    this.render(false);
    this.app.persist();
  }
  // Tell the user when a pattern they already knew about breaks out, reaches its target or fails (opt-in per chart).
  checkPatternAlerts(ind) {
    const id = `${this.cfg.symbol}|${this.cfg.tf}`;
    const prev = this.patSeen?.id === id ? this.patSeen.map : null;
    this.patSeen = { id, map: new Map(this.patternList.map((p) => [p.key, { broke: p.breakI != null, status: p.status }])) };
    if (!prev || !ind.patAlerts) return;
    for (const e of patternEvents(prev, this.patternList)) this.app.patternAlert(`${ticker(this.cfg.symbol)} ${this.cfg.tf}: ${e.text}`);
  }
  setPatternAlerts(on) {
    if (!this.patternInd) return;
    this.patternInd.patAlerts = on;
    this.app.persist();
  }
  setPatternVisible(key, on) {
    const ind = this.patternInd;
    if (!ind) return;
    const hidden = new Set(ind.hiddenPatterns || []);
    on ? hidden.delete(key) : hidden.add(key);
    ind.hiddenPatterns = [...hidden];
    if (!on && this.selectedPattern === key) this.selectedPattern = null;
    this.render(false);
    this.app.persist();
  }
  setAllPatternsVisible(on) {
    const ind = this.patternInd;
    if (!ind) return;
    ind.hiddenPatterns = on ? [] : this.patternList.filter((p) => passesFilter(p, ind.patFilter)).map((p) => p.key);
    if (!on) this.selectedPattern = null;
    this.render(false);
    this.app.persist();
  }

  // ---------- lower-pane headers: name, move up and down, maximize, settings, delete ----------
  positionPaneTools() {
    const panes = this.chart.panes(), groups = this.paneGroups;
    const base = this.chartEl.getBoundingClientRect().top;
    let html = "";
    groups.forEach((g, gi) => {
      const pane = panes[gi + 1];
      if (!pane) return;
      const top = pane.getHTMLElement().getBoundingClientRect().top - base;
      const ind = this.cfg.indicators.find((x) => x.uid === g[0]);
      const def = ind && BY_ID[ind.id];
      if (!def) return;
      const short = /\(([^)]+)\)$/.exec(def.name)?.[1].split(" / ")[0] || def.name;
      const big = this.maxUid === g[0];
      const btn = (act, title, icon, off) => (off ? "" : `<button data-act="${act}" title="${title}">${icon}</button>`);
      html += `<div class="ptb" data-i="${gi}" style="top:${Math.round(top) + 3}px"><span class="ptb-name">${esc(short)} ${esc(this.indicatorParamsLabel(ind))}</span>`
        + btn("up", "Move pane up", ICON.up, gi === 0) + btn("down", "Move pane down", ICON.down, gi === groups.length - 1)
        + btn("max", big ? "Restore pane size" : "Maximize pane", big ? ICON.restore : ICON.max)
        + btn("settings", "Indicator settings", ICON.gear) + btn("remove", "Delete pane", ICON.x) + "</div>";
    });
    if (this.toolsEl.innerHTML !== html) this.toolsEl.innerHTML = html;
  }

  paneTool(e) {
    const act = e.target.closest("[data-act]")?.dataset.act;
    const gi = Number(e.target.closest("[data-i]")?.dataset.i);
    const g = this.paneGroups[gi];
    if (!act || !g) return;
    const ind = this.cfg.indicators.find((x) => x.uid === g[0]);
    if (act === "settings") return ind && this.app.openIndicatorSettings(this, ind);
    if (act === "max") this.maxUid = this.maxUid === g[0] ? null : g[0];
    if (act === "up" || act === "down") this.cfg.indicators = reorder(this.cfg.indicators, this.paneGroups, gi, act === "up" ? -1 : 1);
    if (act === "remove") {
      this.cfg.indicators = withoutGroup(this.cfg.indicators, this.paneGroups, gi);
      if (this.maxUid === g[0]) this.maxUid = null;
    }
    this.render(false);
    this.app.persist();
  }

  // ---------- indicators ----------
  addIndicator(id, params = {}) {
    const uid = newUid();
    this.cfg.indicators.push({ uid, id, params });
    this.render(false);
    this.app.persist();
    return uid;
  }
  removeIndicator(uid) {
    this.cfg.indicators = this.cfg.indicators.filter((x) => x.uid !== uid);
    this.render(false);
    this.app.persist();
  }

  // ---------- drawing tools ----------
  pointAt(p) {
    if (p.paneIndex) return null; // drawings live on the price pane only
    if (!p.point || p.logical == null) return null;
    const logical =
      this.chart.timeScale().coordinateToLogical(p.point.x) ?? p.logical;
    let price = this.main.coordinateToPrice(p.point.y);
    if (this.app.magnet && price != null) {
      // snap to the nearest open, high, low or close of this bar when within 30px
      const bar = this.shown[Math.round(logical)];
      const near = bar && [bar.open, bar.high, bar.low, bar.close]
        .map((v) => [Math.abs(this.main.priceToCoordinate(v) - p.point.y), v])
        .filter((m) => Number.isFinite(m[0]))
        .sort((m, n) => m[0] - n[0])[0];
      if (near && near[0] < 30) price = near[1];
    }
    const time = this.timeOfLogical(logical);
    return price == null || time == null ? null : { time, price };
  }

  onClick(p) {
    const tool = this.app.tool;
    if (tool === "anchor-pick") {
      const pick = this.app.pendingAnchor;
      const ind = pick?.pane === this && this.cfg.indicators.find((x) => x.uid === pick.uid);
      const pt = this.pointAt(p);
      if (!ind || !pt) return;
      // Snap to the raw bar under the click (works on Renko/Heikin Ashi too).
      let i = this.bars.findIndex((b) => b.time > pt.time) - 1;
      if (i < 0) i = this.bars.length - 1;
      ind.params = { ...ind.params, [pick.key]: this.bars[i].time };
      this.app.pendingAnchor = null;
      this.app.setTool("cursor");
      this.render(false);
      this.app.persist();
      this.app.toast("Anchored.");
      return;
    }
    if (tool === "replay-pick") {
      const pt = this.pointAt(p);
      if (!pt) return;
      // map the clicked time back to the raw bars (works for Renko/Heikin Ashi too)
      let i = this.bars.findIndex((b) => b.time > pt.time) - 1;
      if (i < 0) i = this.bars.length - 1;
      this.app.setTool("cursor");
      this.startReplay(Math.max(1, i));
      return;
    }
    if (tool === "cursor") {
      if (!p.point) return;
      this.drawings.selected = this.drawings.hitTest(p.point.x, p.point.y);
      this.drawings.update();
      return;
    }
    if (tool === "brush") return; // drawn by dragging, not by clicks
    const def = TOOL_BY_ID[tool];
    const pt = this.pointAt(p);
    if (!def || !pt) return;
    const d = this.drawings;
    if (!d.temp) {
      d.temp = { id: newUid(), type: tool, points: [pt] };
      if (def.points > 1) d.temp.points.push({ ...pt });
    } else {
      d.temp.points[d.temp.points.length - 1] = pt;
      if (d.temp.points.length < def.points) d.temp.points.push({ ...pt });
      else d.temp.done = true;
    }
    if (def.points === 1) d.temp.done = true;
    if (d.temp.done) {
      const item = d.temp;
      delete item.done;
      d.temp = null;
      if (item.type === "zoom") {
        const [l1, l2] = item.points.map((q) => this.logicalOf(q.time)).sort((m, n) => m - n);
        d.update();
        this.app.setTool("cursor");
        if (l2 - l1 >= 2) this.chart.timeScale().setVisibleLogicalRange({ from: l1, to: l2 });
        return;
      }
      if (item.type === "text") {
        const text = prompt("Note text:", "");
        if (!text) {
          d.update();
          this.app.setTool("cursor");
          return;
        }
        item.text = text;
      }
      d.items.push(item);
      d.selected = item;
      this.app.saveDrawings(this.cfg.symbol, d.items);
      if (!this.app.settings.stayInDrawMode) this.app.setTool("cursor");
    }
    d.update();
  }

  // Zoom in (f < 1) or out (f > 1), keeping the right-hand edge where it is.
  zoomBy(f) {
    const r = this.chart.timeScale().getVisibleLogicalRange();
    if (!r) return;
    const width = Math.max(10, (r.to - r.from) * f);
    this.chart.timeScale().setVisibleLogicalRange({ from: r.to - width, to: r.to });
  }

  // Zoom to the last `days` calendar days of the shown bars (null = every bar).
  setSpan(days) {
    const n = this.shown.length;
    if (!n) return;
    let from = 0;
    if (days) {
      const cut = this.shown[n - 1].time - days * 86400;
      from = Math.max(0, this.shown.findIndex((b) => b.time >= cut));
    }
    this.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, from - 1), to: n + 8 });
  }

  deleteSelectedDrawing() {
    const d = this.drawings;
    if (!d.selected) return false;
    d.items = d.items.filter((x) => x !== d.selected);
    d.selected = null;
    d.update();
    this.app.saveDrawings(this.cfg.symbol, d.items);
    return true;
  }

  clearDrawings() {
    this.drawings.items = [];
    this.drawings.selected = null;
    this.drawings.temp = null;
    this.drawings.update();
    this.app.saveDrawings(this.cfg.symbol, []);
  }

  setInteractive(on) {
    this.chart.applyOptions({ handleScroll: on, handleScale: on });
    if (on && this.drawings.temp) {
      this.drawings.temp = null;
      this.drawings.update();
    }
  }

  // ---------- live updates ----------
  startLive() {
    this.stopLive();
    if (this.replay || !this.bars.length) return;
    const ex = exchange(this.cfg.symbol);
    const wsTf = BINANCE_WS_TF[this.cfg.tf];
    if (ex === "BINANCE" && this.provider === "Binance" && wsTf)
      this.openSocket(ticker(this.cfg.symbol).toLowerCase(), wsTf, 0);
    else if (ex === "BINANCE" && this.provider === "Binance futures" && wsTf && wsTf !== "1s")
      this.openSocket(ticker(this.cfg.symbol).toLowerCase().replace(/\.p$/, ""), wsTf, 0, ["wss://fstream.binance.com/ws/"]);
    else this.poll();
  }

  openSocket(sym, interval, hostIdx, hosts = [
    "wss://stream.binance.com:9443/ws/",
    "wss://data-stream.binance.vision/ws/",
  ]) {
    if (hostIdx >= hosts.length) return this.poll();
    let opened = false;
    const ws = new WebSocket(`${hosts[hostIdx]}${sym}@kline_${interval}`);
    this.ws = ws;
    ws.onopen = () => {
      opened = true;
      this.app.setStatus("ok");
    };
    ws.onmessage = (m) => {
      const k = JSON.parse(m.data).k;
      if (k)
        this.merge([
          {
            time: k.t / 1000,
            open: +k.o,
            high: +k.h,
            low: +k.l,
            close: +k.c,
            volume: +k.v,
          },
        ]);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!opened) this.openSocket(sym, interval, hostIdx + 1, hosts);
      else this.liveTimer = setTimeout(() => this.startLive(), 3000);
    };
  }

  poll() {
    if (exchange(this.cfg.symbol) === "DSE") return this.pollDse();
    const kind = ["BINANCE", "COINBASE", "KRAKEN", "BYBIT", "BLOFIN"].includes(
      exchange(this.cfg.symbol),
    )
      ? 3000
      : 10000;
    const run = (this.liveRun = {}); // stopLive() drops it, so a tick still waiting on the network can't merge or reschedule
    const tick = async () => {
      try {
        const r = await api.candles(this.cfg.symbol, this.cfg.tf, 5);
        if (this.liveRun !== run) return;
        this.merge(r.candles);
      } catch {
        /* keep trying */
      }
      if (this.liveRun !== run) return;
      this.liveTimer = setTimeout(tick, kind);
    };
    this.liveTimer = setTimeout(tick, kind);
  }

  // DSE: ask for the newest bars every 10 s (30 s on hourly) while the exchange is open, and once a minute otherwise,
  // with one last ask right after it closes so the closing bar is the final one. `liveOn` lights the "live" badge.
  pollDse() {
    const intraday = isIntraday(this.cfg.tf);
    let wasOpen = isSessionOpen(Date.now());
    if (this.liveOn !== wasOpen) {
      this.liveOn = wasOpen;
      this.updateLegend();
    }
    const run = (this.liveRun = {}); // stopLive() drops it, so a tick still waiting on the network can't merge or reschedule
    const tick = async () => {
      const now = Date.now(), open = isSessionOpen(now);
      if (open || wasOpen) {
        try {
          const r = await api.candles(this.cfg.symbol, this.cfg.tf, 5, !!this.cfg.adjusted);
          if (this.liveRun !== run) return;
          this.merge(r.candles);
        } catch {
          /* keep trying */
        }
        if (this.liveRun !== run) return;
      }
      if (open !== this.liveOn) {
        this.liveOn = open;
        this.updateLegend();
      }
      wasOpen = open;
      this.liveTimer = setTimeout(tick, pollDelayMs(Date.now(), intraday));
    };
    this.liveTimer = setTimeout(tick, pollDelayMs(Date.now(), intraday));
  }

  stopLive() {
    clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.liveRun = null;
    this.liveOn = false;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
  }

  merge(newBars) {
    if (!this.bars.length || this.replay) return;
    let changed = false;
    for (const b of newBars) {
      const last = this.bars.at(-1);
      if (b.time === last.time) {
        this.bars[this.bars.length - 1] = b;
        changed = true;
      } else if (b.time > last.time) {
        this.bars.push(b);
        changed = true;
      }
    }
    if (!changed) return;
    const last = this.bars.at(-1);
    this.app.onPrice(this.cfg.symbol, last.close);
    const simple = [
      "candles",
      "hollow",
      "bars",
      "line",
      "linemarkers",
      "step",
      "area",
      "baseline",
      "columns",
    ].includes(this.cfg.type);
    if (simple) {
      this.shown = this.bars;
      if (this.times.at(-1) !== this.toChart(last.time))
        this.times.push(this.toChart(last.time));
      this.main.update(this.pointFor(last));
      if (this.volume) {
        const m = this.volMaPoint(this.bars, this.bars.length - 1);
        this.volume.update(this.volPoint(last, m.value ?? null));
        this.volMA?.update(m);
      }
    }
    const now = Date.now();
    if (now - (this.mtfCheckedAt || 0) > 60000) {
      this.mtfCheckedAt = now;
      for (const [tf, h] of Object.entries(this.mtf || {})) if (now - h.at > 60000) this.loadMtf(tf);
    }
    if (!simple || now - (this.lastFull || 0) > 1500) {
      this.lastFull = now;
      if (simple) {
        this.renderIndicators();
        this.updateLegend();
      } else this.render(false);
    }
  }

  // ---------- bar replay ----------
  startReplay(index) {
    if (this.adjustedApplied) return this.app.toast("Prices are adjusted on this chart. Turn Adjusted off to replay: paper trades must use the prices that traded.", "err");
    this.stopLive();
    this.replay = {
      index: Math.max(1, Math.min(index, this.bars.length - 1)),
      playing: false,
      speed: 2,
    };
    let bar = this.el.querySelector(".replay-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "replay-bar";
      bar.innerHTML = `<span class="hint">Replay</span>
        <button data-r="back" title="Step back">&#9664;&#9664;</button>
        <button data-r="play" title="Play / pause">&#9654;</button>
        <button data-r="fwd" title="Step forward">&#9654;&#9654;</button>
        <select data-r="speed" title="Speed"><option value="0.5">0.5x</option><option value="1">1x</option><option value="2" selected>2x</option><option value="5">5x</option><option value="10">10x</option></select>
        <button data-r="pick" title="Pick a new start bar">Jump to…</button>
        ${this.app.panes.length > 1 ? `<label class="hint" title="Replay every chart in the layout to the same moment"><input type="checkbox" data-r="sync" ${this.app.settings.syncReplay ? "checked" : ""}> All charts</label>` : ""}
        <button data-r="exit" title="Back to live">Exit</button>`;
      this.el.appendChild(bar);
      bar.addEventListener("click", (e) => {
        const r = e.target.closest("[data-r]")?.dataset.r;
        if (r === "back") this.replayStep(-1);
        if (r === "fwd") this.replayStep(1);
        if (r === "play") this.toggleReplay();
        if (r === "pick") this.app.setTool("replay-pick");
        if (r === "exit") this.stopReplay();
      });
      const sync = bar.querySelector('[data-r="sync"]');
      if (sync)
        sync.onchange = (e) => {
          this.app.settings.syncReplay = e.target.checked;
          this.app.persist();
          if (e.target.checked) this.app.onReplayStart?.(this);
          else this.app.onReplayStop?.(this, { keepSelf: true });
        };
      bar.querySelector('[data-r="speed"]').onchange = (e) => {
        this.replay.speed = Number(e.target.value);
        if (this.replay.playing) {
          this.toggleReplay();
          this.toggleReplay();
        }
      };
    }
    this.render(false);
    this.app.onReplayStart?.(this);
  }

  // Follow another chart's replay: show only the bars that had finished by `endTime`.
  replayTo(endTime) {
    const sec = parseTf(this.cfg.tf).seconds;
    let i = this.bars.length - 1;
    while (i > 0 && this.bars[i].time + sec > endTime) i--;
    if (!this.replay) {
      this.stopLive();
      this.replay = { index: i, playing: false, speed: 2, follower: true };
      this.el.querySelector(".replay-bar")?.remove();
      const tag = document.createElement("div");
      tag.className = "replay-bar follower";
      tag.innerHTML = '<span class="hint">Synced replay</span>';
      this.el.appendChild(tag);
    } else this.replay.index = i;
    this.render(false);
  }

  replayStep(dir) {
    if (!this.replay) return;
    const next = this.replay.index + dir;
    if (next < 1 || next >= this.bars.length) {
      if (this.replay.playing) this.toggleReplay();
      return;
    }
    this.replay.index = next;
    this.render(false);
    this.app.onReplayBar?.(this, this.bars[next]);
  }

  toggleReplay() {
    if (!this.replay) return;
    this.replay.playing = !this.replay.playing;
    clearInterval(this.replayTimer);
    if (this.replay.playing)
      this.replayTimer = setInterval(
        () => this.replayStep(1),
        1000 / this.replay.speed,
      );
    const btn = this.el.querySelector('[data-r="play"]');
    if (btn)
      btn.innerHTML = this.replay.playing ? "&#10074;&#10074;" : "&#9654;";
  }

  stopReplay() {
    clearInterval(this.replayTimer);
    const wasFollower = this.replay?.follower;
    this.replay = null;
    this.el.querySelector(".replay-bar")?.remove();
    this.render(true);
    this.startLive();
    if (!wasFollower) this.app.onReplayStop?.(this);
  }

  // ---------- export ----------
  screenshot() {
    const canvas = this.chart.takeScreenshot(true);
    const ctx = canvas.getContext("2d");
    ctx.font = "600 14px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = css("--text");
    ctx.fillText(`${ticker(this.cfg.symbol)} · ${this.cfg.tf}`, 12, 22);
    return canvas;
  }

  destroy() {
    this.stopLive();
    clearInterval(this.replayTimer);
    this.chart.remove();
  }
}
