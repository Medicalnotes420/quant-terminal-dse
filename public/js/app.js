import { api, download, esc, ticker, exchange } from "./api.js";
import { ChartPane, CHART_TYPES, newUid } from "./chart.js";
import { TOOLS } from "./drawings.js";
import {
  INDICATORS,
  BY_ID,
  registerIndicator,
  compute,
} from "../lib/indicators.js";
import { parseTf, toCsv } from "../lib/series.js";
import { canClose } from "../lib/panes.js";
import { initPanels } from "./panels.js";

const $ = (s, el = document) => el.querySelector(s);
const TF_QUICK = ["1h", "1D", "1W", "1M"]; // DSE: hourly from StockNow, daily history from your files
const LAYOUTS = { 1: 1, "2v": 2, "2h": 2, 3: 3, 4: 4, 6: 6, 8: 8, 16: 16 };
const DEFAULT_WATCHLISTS = {
  Main: [
    "DSE:DSEX",
    "DSE:DS30",
    "DSE:AL-HAJTEX",
    "DSE:ORIONINFU",
    "DSE:SONALIANSH",
    "DSE:WATACHEM",
  ],
};
// Only DSE shares and your own CSV files are served, so anything else saved earlier is dropped on load.
const PA_ICON = {
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  max: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  restore: '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
};
const SIDE_MIN = 220, SIDE_MAX = 640;
const isDse = (s) => /^(DSE|CSV):/.test(String(s));

class App {
  constructor() {
    this.panes = [];
    this.active = null;
    this.tool = "cursor";
    this.prices = {};
    this.priceListeners = new Set();
    this.saveTimer = null;
  }

  async init() {
    let state = {};
    try {
      state = await api.get("/api/state");
    } catch {
      /* first run */
    }
    this.state = {
      layout: "1",
      panes: [
        {
          symbol: "DSE:DSEX",
          tf: "1D",
          type: "candles",
          indicators: [
            { uid: newUid(), id: "ema", params: { length: 21 } },
            { uid: newUid(), id: "rsi", params: {} },
            { uid: newUid(), id: "chartpatterns", params: {} },
          ],
        },
      ],
      watchlists: DEFAULT_WATCHLISTS,
      savedLayouts: {},
      sideWidth: 300,
      sideCollapsed: false,
      activeWatchlist: "Main",
      drawings: {},
      settings: {},
      paper: null,
      strategies: {},
      ...state,
    };
    // once: charts saved before the patterns indicator joined the default layout get it too (removing it later sticks)
    if (!this.state.migrated?.patterns) {
      const give = (cfg) => {
        if (!cfg.indicators?.some((i) => i.id === "chartpatterns")) (cfg.indicators ||= []).push({ uid: newUid(), id: "chartpatterns", params: {} });
      };
      this.state.panes.forEach(give);
      Object.values(this.state.savedLayouts || {}).forEach((l) => l.panes?.forEach(give));
      this.state.migrated = { ...this.state.migrated, patterns: true };
    }
    this.settings = {
      theme: "dark",
      volume: true,
      bars: 3000,
      utc: false,
      stayInDrawMode: false,
      syncCrosshair: false,
      ...this.state.settings,
    };
    this.state.settings = this.settings;
    for (const p of this.state.panes) if (!isDse(p.symbol)) p.symbol = "DSE:DSEX";
    // ?symbol=DSE:AL-HAJTEX opens that share on the first chart
    const want = new URLSearchParams(location.search).get("symbol");
    if (want && isDse(want)) this.state.panes[0].symbol = want;
    for (const k of ["magnet", "lockDrawings", "hideDrawings"]) this[k] = !!this.settings[k];
    for (const [name, list] of Object.entries(this.state.watchlists)) {
      const kept = list.filter(isDse);
      this.state.watchlists[name] = kept.length ? kept : [...DEFAULT_WATCHLISTS.Main];
    }
    document.documentElement.dataset.theme = this.settings.theme;
    await this.loadCustomIndicators();
    this.buildToolbar();
    this.buildDrawbar();
    this.buildRangeBar();
    this.setLayout(this.state.layout, false);
    this.bindSidePanel();
    this.panels = initPanels(this);
    this.bindKeys();
    this.listenAlerts();
    this.checkHealth();
    setInterval(() => this.checkHealth(), 60000);
  }

  // ---------- persistence ----------
  persist() {
    this.state.panes = this.panes.map((p) => p.cfg);
    this.state.active = this.panes.indexOf(this.active);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(
      () =>
        api
          .put("/api/state", this.state)
          .catch((e) => this.toast(`Couldn't save: ${e.message}`, "err")),
      400,
    );
  }
  getDrawings(symbol) {
    return structuredClone(this.state.drawings[symbol] || []);
  }
  saveDrawings(symbol, items, fromHistory = false) {
    if (!fromHistory) {
      // the saved copy is the state before this change; keep up to 50 steps per symbol
      const h = ((this.hist ||= {})[symbol] ||= { undo: [], redo: [] });
      h.undo.push(this.getDrawings(symbol));
      if (h.undo.length > 50) h.undo.shift();
      h.redo = [];
    }
    this.state.drawings[symbol] = items.map(
      ({ id, type, points, text, color, rr }) => ({
        id,
        type,
        points,
        text,
        color,
        rr,
      }),
    );
    for (const p of this.panes)
      if (p.cfg.symbol === symbol && p.drawings.items !== items)
        p.drawings.setItems(this.getDrawings(symbol));
    this.persist();
  }

  // ---------- custom indicators ----------
  async loadCustomIndicators() {
    try {
      const list = await api.get("/api/custom");
      for (const c of list) await this.importCustom(c.file, c.mtime);
    } catch {
      /* none */
    }
  }
  async importCustom(file, v = Date.now()) {
    try {
      const mod = await import(`/custom/${encodeURIComponent(file)}?v=${v}`);
      return registerIndicator({
        ...mod.default,
        id: `custom:${file.replace(/\.js$/, "")}`,
      });
    } catch (e) {
      this.toast(
        `Custom indicator ${file} failed to load: ${e.message}`,
        "err",
      );
      return null;
    }
  }

  // ---------- layout ----------
  setLayout(layout, save = true) {
    const count = LAYOUTS[layout] || 1;
    this.state.layout = String(layout);
    const grid = $("#grid");
    grid.dataset.count = count;
    const cols = {
      1: "1fr",
      2: layout === "2h" ? "1fr" : "1fr 1fr",
      3: "2fr 1fr",
      4: "1fr 1fr",
      6: "1fr 1fr 1fr",
      8: "1fr 1fr 1fr 1fr",
      16: "repeat(4, 1fr)",
    }[count];
    const rows = {
      1: "1fr",
      2: layout === "2h" ? "1fr 1fr" : "1fr",
      3: "1fr 1fr",
      4: "1fr 1fr",
      6: "1fr 1fr",
      8: "1fr 1fr",
      16: "repeat(4, 1fr)",
    }[count];
    grid.style.gridTemplateColumns = cols;
    grid.style.gridTemplateRows = rows;
    const cfgs = this.panes.length
      ? this.panes.map((p) => p.cfg)
      : this.state.panes;
    while (this.panes.length > count) this.panes.pop().destroy();
    const tfs = ["1D", "1W", "1M", "1D", "1W", "1M", "1D", "1W"];
    for (let i = 0; i < count; i++) {
      if (this.panes[i]) continue;
      const el = document.createElement("div");
      el.className = "pane";
      grid.appendChild(el);
      const base = cfgs[i] || {
        ...structuredClone(cfgs[0] || {}),
        tf: tfs[i % tfs.length],
        indicators: [{ uid: newUid(), id: "chartpatterns", params: {} }],
      };
      const pane = new ChartPane(this, el, base);
      this.panes.push(pane);
      pane.load().then(() => this.span !== undefined && pane.setSpan(this.span));
    }
    [...grid.children].forEach((el) => {
      if (!this.panes.some((p) => p.el === el)) el.remove();
    });
    if (count === 3) this.panes[0].el.style.gridRow = "span 2";
    else if (this.panes[0]) this.panes[0].el.style.gridRow = "";
    grid.classList.remove("has-max");
    for (const p of this.panes) p.el.classList.remove("max");
    this.setActive(
      this.panes[Math.min(this.state.active ?? 0, count - 1)] || this.panes[0],
    );
    this.updatePaneActions();
    $("#layoutSel").value = this.state.layout;
    if (save) this.persist();
  }

  // ---------- the side panel (Favorites, All shares, Details, Alerts): drag its edge to resize, minimize to a tab ----------
  applySide() {
    const w = Math.max(SIDE_MIN, Math.min(SIDE_MAX, Number(this.state.sideWidth) || 300));
    this.state.sideWidth = w;
    document.querySelector(".side").style.width = `${w}px`;
    $(".main").classList.toggle("side-collapsed", !!this.state.sideCollapsed);
    $("#sideResizer").setAttribute("aria-valuenow", String(w));
  }
  bindSidePanel() {
    const set = (w, save = true) => {
      this.state.sideWidth = w;
      this.applySide();
      if (save) this.persist();
    };
    // The icon rail (like BullBD's): click an icon to open its tab; click the open tab's icon to collapse the panel.
    const rail = $("#sideRail");
    const sync = () => {
      const cur = document.querySelector("#sideTabs .active")?.dataset.tab;
      $("#sideTitle").textContent = document.querySelector("#sideTabs .active")?.textContent.trim() || "";
      rail.querySelectorAll("button").forEach((b) => b.classList.toggle("active", !this.state.sideCollapsed && b.dataset.tab === cur));
    };
    const collapse = (on) => {
      this.state.sideCollapsed = on;
      this.applySide();
      this.persist();
      sync();
    };
    $("#sideClose").onclick = () => collapse(true);
    rail.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const cur = document.querySelector("#sideTabs .active")?.dataset.tab;
      if (!this.state.sideCollapsed && cur === b.dataset.tab) return collapse(true);
      if (cur !== b.dataset.tab) document.querySelector(`#sideTabs [data-tab="${b.dataset.tab}"]`)?.click();
      collapse(false);
    };
    new MutationObserver(sync).observe($("#sideTabs"), { subtree: true, attributes: true, attributeFilter: ["class"] });
    sync();
    $("#sideToggle").onclick = () => collapse(true);
    $("#sideOpen").onclick = () => collapse(false);
    const bar = $("#sideResizer");
    bar.onpointerdown = (e) => {
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      bar.classList.add("dragging");
      const right = $(".main").getBoundingClientRect().right;
      bar.onpointermove = (m) => set(right - m.clientX, false); // the panel's left edge follows the pointer
    };
    bar.onpointerup = (e) => {
      bar.releasePointerCapture(e.pointerId);
      bar.onpointermove = null;
      bar.classList.remove("dragging");
      this.persist();
    };
    bar.ondblclick = () => set(300);
    bar.onkeydown = (e) => {
      const step = e.shiftKey ? 60 : 20;
      if (e.key === "ArrowLeft") set(this.state.sideWidth + step);
      else if (e.key === "ArrowRight") set(this.state.sideWidth - step);
      else return;
      e.preventDefault();
    };
    this.applySide();
  }

  // ---------- saved layouts: the chart arrangement, each chart's symbol, timeframe and indicators ----------
  snapshotLayout() {
    return { layout: this.state.layout, panes: this.panes.map((p) => structuredClone(p.cfg)), savedAt: Date.now() };
  }
  applyLayout(saved) {
    while (this.panes.length) this.panes.pop().destroy();
    $("#grid").innerHTML = "";
    this.active = null;
    this.state.panes = structuredClone(saved.panes);
    this.setLayout(saved.layout);
  }
  openLayoutsDialog() {
    const lay = (this.state.savedLayouts ||= {});
    const card = this.modal(
      "Chart layouts",
      `<div class="row-flex"><input class="in" id="lyName" placeholder="Name this layout" style="flex:1"><button class="btn primary" id="lySave">Save current</button></div>
       <div id="lyList" style="margin-top:10px"></div>
       <div class="hint-text" style="margin-top:8px">Loading a layout replaces the one on screen; the current one is kept as "Previous" first.</div>`,
    );
    const draw = () => {
      const names = Object.keys(lay);
      card.querySelector("#lyList").innerHTML = names.length
        ? names.map((n) => `<div class="row-flex" data-n="${esc(n)}" style="padding:4px 0;border-bottom:1px solid var(--border)"><b style="flex:1">${esc(n)}</b><span class="muted">${lay[n].panes.length} chart${lay[n].panes.length > 1 ? "s" : ""} · ${new Date(lay[n].savedAt).toLocaleDateString()}</span><button class="btn small" data-act="load">Load</button><button class="btn small danger" data-act="del">Delete</button></div>`).join("")
        : '<div class="hint-text">Nothing saved yet.</div>';
    };
    draw();
    card.querySelector("#lySave").onclick = () => {
      const n = card.querySelector("#lyName").value.trim();
      if (!n) return this.toast("Give the layout a name.");
      if (lay[n] && !confirm(`Replace the saved layout "${n}"?`)) return;
      lay[n] = this.snapshotLayout();
      this.persist();
      this.toast(`Saved "${n}".`);
      card.querySelector("#lyName").value = "";
      draw();
    };
    card.querySelector("#lyList").onclick = (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      const n = e.target.closest("[data-n]")?.dataset.n;
      if (!act || !lay[n]) return;
      if (act === "del") {
        if (!confirm(`Delete the saved layout "${n}"? This can't be undone.`)) return;
        delete lay[n];
        this.persist();
        return draw();
      }
      if (!confirm(`Load "${n}"? The layout on screen is kept as "Previous".`)) return;
      const target = lay[n]; // taken first: loading "Previous" must not read the copy just made
      lay.Previous = this.snapshotLayout();
      this.applyLayout(target);
      this.persist();
      this.closeModal();
    };
  }

  // The buttons in a chart's top-right corner: fill the window, and close this chart.
  updatePaneActions() {
    const many = this.panes.length > 1;
    for (const p of this.panes) {
      const full = p.el.classList.contains("max");
      p.actionsEl.innerHTML = many
        ? `<button data-act="maxchart" title="${full ? "Restore the layout (Esc)" : "Fill the window"}">${full ? PA_ICON.restore : PA_ICON.max}</button>`
          + (canClose(this.panes.length) && !full ? `<button data-act="closechart" title="Close this chart">${PA_ICON.x}</button>` : "")
        : "";
    }
  }

  paneAction(pane, act) {
    if (act === "maxchart") {
      const on = !pane.el.classList.contains("max");
      for (const p of this.panes) p.el.classList.remove("max");
      if (on) pane.el.classList.add("max");
      $("#grid").classList.toggle("has-max", on);
      this.setActive(pane);
      this.updatePaneActions();
    }
    if (act === "closechart" && canClose(this.panes.length)) {
      const i = this.panes.indexOf(pane);
      this.panes.splice(i, 1);
      pane.destroy();
      pane.el.remove();
      const n = this.panes.length;
      if (this.active === pane) this.active = null;
      this.setLayout(n === 2 ? "2v" : String(n));
    }
  }

  setActive(pane) {
    if (!pane || this.active === pane) return;
    this.active?.el.classList.remove("active");
    this.active = pane;
    pane.el.classList.add("active");
    this.syncToolbar();
    this.updateNotes();
    this.panels?.onActiveChange?.();
  }

  onPaneLoaded(pane) {
    if (pane === this.active) {
      this.syncToolbar();
      this.updateNotes();
      this.panels?.onActiveChange?.();
    }
  }

  // the chart's patterns changed (a redraw, a selection, a switch): keep the Patterns tab in step
  onPatterns(pane) {
    if (pane === this.active) this.panels?.onPatterns?.();
  }

  // What the data says about itself (where the bars came from, the last day, a live bar): the foot of the side panel,
  // for the chart that is active, so it never covers the candles.
  updateNotes() {
    const box = $("#sideNotes");
    if (!box) return;
    box.innerHTML = (this.active?.notes || []).map((n) => `<p>${esc(n)}</p>`).join("");
  }

  // ---------- toolbar ----------
  buildToolbar() {
    const tfBox = $("#tfButtons");
    tfBox.innerHTML = TF_QUICK.map(
      (t, k) => `<button data-tf="${t}" title="${t}  (Alt+${k + 1}; Alt+[ and Alt+] step through)">${t}</button>`,
    ).join("");
    tfBox.onclick = (e) => {
      const tf = e.target.dataset.tf;
      if (tf) this.setTf(tf);
    };
    $("#tfCustom").onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const v = e.target.value
        .trim()
        .replace(/^(\d+)d$/i, "$1D")
        .replace(/^(\d+)w$/i, "$1W");
      try {
        parseTf(v);
        this.setTf(v);
        e.target.value = "";
        e.target.blur();
      } catch (err) {
        this.toast(err.message, "err");
      }
    };
    $("#chartType").innerHTML = CHART_TYPES.map(
      ([v, l]) => `<option value="${v}">${l}</option>`,
    ).join("");
    $("#chartType").onchange = (e) => {
      this.active.cfg.type = e.target.value;
      this.active.render(true);
      this.persist();
    };
    $("#symbolBtn").onclick = () => this.openSymbolSearch();
    $("#indicatorsBtn").onclick = () => this.openIndicatorPicker();
    $("#compareBtn").onclick = () =>
      this.openSymbolSearch(
        "",
        (sym) => {
          this.active.cfg.compare.push(sym);
          this.persist();
          this.active.load({ keepView: true });
        },
        "Compare with…",
      );
    $("#layoutSel").onchange = (e) => this.setLayout(e.target.value);
    $("#syncSymbol").checked = !!this.settings.syncSymbol;
    $("#syncSymbol").onchange = (e) => {
      this.settings.syncSymbol = e.target.checked;
      this.persist();
    };
    $("#replayBtn").onclick = () => {
      if (this.active.replay) return this.active.stopReplay();
      if (this.active.adjustedApplied) return this.toast("Prices are adjusted on this chart. Turn Adjusted off to replay: paper trades must use the prices that traded.", "err");
      this.setTool("replay-pick");
      this.toast("Click the bar you want replay to start from.");
    };
    // with a line selected on the chart, Alert watches that line; otherwise it opens the alert dialog
    $("#alertBtn").onclick = () => (this.active?.drawings.selected ? this.alertOnSelectedDrawing() : this.panels.openAlertDialog());
    $("#adjBtn").onclick = () => {
      this.active.cfg.adjusted = !this.active.cfg.adjusted;
      this.active.load({ keepView: true });
      this.syncToolbar();
      this.persist();
    };
    $("#marksBtn").onclick = () => {
      this.active.cfg.marks = this.active.cfg.marks === false; // on by default
      this.active.render(false);
      this.syncToolbar();
      this.persist();
    };
    $("#saveBtn").onclick = () => this.openLayoutsDialog();
    $("#patBtn").onclick = () => {
      this.active.cfg.patterns = !this.active.cfg.patterns;
      this.active.loadPatterns();
      this.syncToolbar();
      this.persist();
    };
    $("#logBtn").onclick = () => {
      this.active.cfg.log = !this.active.cfg.log;
      this.active.render(false);
      this.syncToolbar();
      this.persist();
    };
    $("#tbUndo").onclick = () => this.stepDrawings(false);
    $("#tbRedo").onclick = () => this.stepDrawings(true);
    $("#zoomInBtn").onclick = () => this.active?.zoomBy(0.7);
    $("#zoomOutBtn").onclick = () => this.active?.zoomBy(1 / 0.7);
    $("#fsBtn").onclick = () =>
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    $("#snapBtn").onclick = () =>
      this.active
        .screenshot()
        .toBlob((b) =>
          download(
            `${ticker(this.active.cfg.symbol)}-${this.active.cfg.tf}.png`,
            b,
          ),
        );
    $("#csvBtn").onclick = () => this.exportCsv();
    $("#themeBtn").onclick = () => {
      this.settings.theme = this.settings.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = this.settings.theme;
      this.panes.forEach((p) => p.applyTheme());
      this.panels.onTheme?.();
      this.persist();
    };
    $("#settingsBtn").onclick = () => this.openSettings();
  }

  syncToolbar() {
    const p = this.active;
    if (!p) return;
    $("#symbolLabel").textContent = ticker(p.cfg.symbol);
    $("#symbolBtn").title =
      `${p.cfg.symbol} — change symbol (or just start typing)`;
    document
      .querySelectorAll("#tfButtons button")
      .forEach((b) => b.classList.toggle("active", b.dataset.tf === p.cfg.tf));
    $("#tfCustom").placeholder = TF_QUICK.includes(p.cfg.tf) ? "7m" : p.cfg.tf;
    $("#tfCustom").classList.toggle("on", !TF_QUICK.includes(p.cfg.tf));
    $("#chartType").value = p.cfg.type;
    $("#logBtn").classList.toggle("on", !!p.cfg.log);
    $("#pctBtn").classList.toggle("on", !!p.cfg.pct);
    $("#patBtn").classList.toggle("on", !!p.cfg.patterns);
    $("#marksBtn").classList.toggle("on", p.cfg.marks !== false);
    $("#adjBtn").classList.toggle("on", !!p.cfg.adjusted);
    $("#replayBtn").classList.toggle("on", !!p.replay);
  }

  setTf(tf) {
    this.active.cfg.tf = tf;
    this.active.load();
    this.syncToolbar();
    this.persist();
  }

  setSymbol(sym, pane = this.active) {
    const targets = this.settings.syncSymbol ? this.panes : [pane];
    for (const p of targets) {
      p.cfg.symbol = sym;
      p.cfg.compare = p.cfg.compare.filter((s) => s !== sym);
      p.load();
    }
    this.syncToolbar();
    this.persist();
  }

  buildRangeBar() {
    const spans = [["5d", 5], ["1m", 31], ["3m", 92], ["6m", 183], ["1y", 365], ["5y", 1826], ["All", null]];
    const bar = $("#rangeBar");
    bar.insertAdjacentHTML("afterbegin", spans.map(([t, d]) => `<button data-days="${d}">${t}</button>`).join(""));
    $("#pctBtn").onclick = () => {
      this.active.cfg.pct = !this.active.cfg.pct;
      this.active.render(false);
      this.syncToolbar();
      this.persist();
    };
    $("#autoBtn").onclick = () => this.active?.chart.priceScale("right").applyOptions({ autoScale: true });
    bar.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || !("days" in b.dataset)) return;
      const days = b.dataset.days === "null" ? null : Number(b.dataset.days);
      this.span = days; // charts opened later in a bigger layout start on the same span
      for (const p of this.settings.syncSymbol ? this.panes : [this.active]) p?.setSpan(days);
    };
  }

  stepDrawings(redo) {
    const sym = this.active?.cfg.symbol;
    const h = this.hist?.[sym];
    const from = redo ? h?.redo : h?.undo;
    if (!from?.length) return this.toast(redo ? "Nothing to redo." : "Nothing to undo.");
    (redo ? h.undo : h.redo).push(this.getDrawings(sym));
    this.saveDrawings(sym, from.pop(), true);
  }

  setDrawbar(open) {
    this.settings.drawCollapsed = !open;
    $(".main").classList.toggle("draw-collapsed", !open);
    this.persist();
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))); // charts refit the wider area
  }

  buildDrawbar() {
    const bar = $("#drawbar");
    // Tools sit in groups like BullBD's toolbar: the button shows the last tool used, a flyout lists the rest.
    const T = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
    const item = (t, label = "") => `<button data-tool="${t.id}" title="${t.label}"><svg viewBox="0 0 24 24">${t.icon}</svg>${label}</button>`;
    const group = (ids) =>
      ids.length === 1
        ? item(T[ids[0]])
        : `<div class="dg">${item(T[ids[0]])}<div class="dg-fly">${ids.map((id) => item(T[id], `<span>${T[id].label}</span>`)).join("")}</div></div>`;
    // BullBD's groups, in its order: cursors, lines, Fibonacci, shapes, annotation, patterns, prediction and measurement
    bar.innerHTML =
      item(T.cursor) + "<hr>" +
      [["trend", "ray", "extended", "hline", "hray", "vline", "channel"], ["fib"], ["brush", "rect"], ["text"], ["xabcd"], ["long", "short", "measure"]].map(group).join("") +
      "<hr>" + item(T.zoom) +
      '<button data-act="magnet" title="Magnet: snap drawing points to the nearest open, high, low or close"><svg viewBox="0 0 24 24"><path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4zM6 8h4M14 8h4"/></svg></button>' +
      '<button data-act="stay" title="Stay in drawing mode: keep the tool after placing a drawing"><svg viewBox="0 0 24 24"><path d="M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3"/></svg></button>' +
      '<button data-act="lock" title="Lock drawings: stops them being selected or deleted"><svg viewBox="0 0 24 24"><path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3"/></svg></button>' +
      '<button data-act="hide" title="Hide all drawings"><svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M4 20L20 4"/></svg></button>' +
      '<hr><button data-act="delete" title="Remove the selected drawing, or all drawings if none is selected"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>' +
      '<button data-act="collapse" class="dg-collapse" title="Hide the drawing toolbar"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>';
    for (const [act, flag] of [["magnet", "magnet"], ["lock", "lockDrawings"], ["hide", "hideDrawings"]])
      bar.querySelector(`[data-act="${act}"]`).classList.toggle("active", !!this[flag]);
    bar.querySelector('[data-act="stay"]').classList.toggle("active", !!this.settings.stayInDrawMode);
    $(".main").classList.toggle("draw-collapsed", !!this.settings.drawCollapsed);
    $("#drawOpen").onclick = () => this.setDrawbar(true);
    bar.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const fly = b.closest(".dg-fly");
      if (fly) {
        // picking from a flyout puts that tool on the group's button and closes the flyout
        const g = fly.parentElement;
        const main = g.firstElementChild;
        main.dataset.tool = b.dataset.tool;
        main.title = b.title;
        main.innerHTML = b.querySelector("svg").outerHTML;
        g.classList.add("shut");
        g.onmouseleave = () => g.classList.remove("shut");
      }
      if (b.dataset.tool)
        this.setTool(this.tool === b.dataset.tool ? "cursor" : b.dataset.tool);
      const flag = { magnet: "magnet", lock: "lockDrawings", hide: "hideDrawings" }[b.dataset.act];
      if (flag) {
        this[flag] = !this[flag];
        this.settings[flag] = this[flag];
        this.persist();
        b.classList.toggle("active", this[flag]);
        for (const p of this.panes) {
          if (flag !== "magnet") p.drawings.selected = null;
          p.drawings.update();
        }
      }
      if (b.dataset.act === "stay") {
        this.settings.stayInDrawMode = !this.settings.stayInDrawMode;
        b.classList.toggle("active", this.settings.stayInDrawMode);
        this.persist();
      }
      if (b.dataset.act === "collapse") this.setDrawbar(false);
      // the bin removes the selected drawing, or every drawing on this symbol when none is selected (as BullBD's does)
      if (
        b.dataset.act === "delete" &&
        !this.active.deleteSelectedDrawing() &&
        this.active.drawings.items.length &&
        confirm(`Remove every drawing on ${ticker(this.active.cfg.symbol)}?`)
      )
        this.active.clearDrawings();
    };
    this.setTool("cursor");
  }

  setTool(tool) {
    this.tool = tool;
    document
      .querySelectorAll("#drawbar [data-tool]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
    for (const p of this.panes) p.setInteractive(tool === "cursor");
    document.body.style.cursor = tool === "cursor" ? "" : "crosshair";
  }

  // ---------- modals ----------
  modal(title, bodyHtml, { foot = "", wide = false } = {}) {
    const card = $("#modalCard");
    card.style.width = wide ? "min(780px, 96vw)" : "";
    card.innerHTML = `<div class="modal-head"><span>${esc(title)}</span><button data-close title="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="modal-body">${bodyHtml}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ""}`;
    $("#modal").classList.remove("hidden");
    card.querySelector("[data-close]").onclick = () => this.closeModal();
    $("#modal").onmousedown = (e) => {
      if (e.target.id === "modal") this.closeModal();
    };
    return card;
  }
  closeModal() {
    $("#modal").classList.add("hidden");
    $("#modalCard").innerHTML = "";
  }

  openSymbolSearch(initial = "", onPick = null, title = "Symbol search") {
    const card = this.modal(
      title,
      `<input class="search-in" id="symQ" placeholder="DSEX, AL-HAJTEX, ORIONINFU…" autocomplete="off" value="${esc(initial)}"><div class="list" id="symList"></div><div class="hint-text" style="margin-top:8px">Dhaka Stock Exchange shares and indexes (DSEX, DS30), from your day-end files, and your own CSV files.</div>`,
    );
    const q = card.querySelector("#symQ"),
      list = card.querySelector("#symList");
    let sel = 0,
      results = [],
      timer;
    const pick = (sym) => {
      this.closeModal();
      if (onPick) onPick(sym);
      else this.setSymbol(sym);
    };
    const draw = () => {
      list.innerHTML =
        results
          .map(
            (r, i) =>
              `<div class="item ${i === sel ? "sel" : ""}" data-i="${i}"><span><b>${esc(ticker(r.symbol))}</b> <span class="muted">${esc(r.name || "")}</span></span><span class="meta">${esc(r.type || "")} · ${esc(r.exchange || "")}</span></div>`,
          )
          .join("") ||
        (q.value.trim()
          ? `<div class="item" data-raw="1"><span>Open <b>${esc(q.value.trim().toUpperCase())}</b></span><span class="meta">press Enter</span></div>`
          : "");
    };
    const run = async () => {
      const v = q.value.trim();
      if (!v) {
        results = [];
        draw();
        return;
      }
      try {
        results = await api.search(v);
      } catch {
        results = [];
      }
      if (q.value.trim() === v) {
        sel = 0;
        draw();
      }
    };
    q.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 180);
    };
    q.onkeydown = (e) => {
      if (e.key === "ArrowDown") {
        sel = Math.min(sel + 1, results.length - 1);
        draw();
        e.preventDefault();
      }
      if (e.key === "ArrowUp") {
        sel = Math.max(sel - 1, 0);
        draw();
        e.preventDefault();
      }
      if (e.key === "Enter") pick(results[sel]?.symbol || q.value.trim());
    };
    list.onclick = (e) => {
      const it = e.target.closest(".item");
      if (!it) return;
      pick(
        it.dataset.raw ? q.value.trim() : results[Number(it.dataset.i)].symbol,
      );
    };
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
    if (initial) run();
  }

  openIndicatorPicker() {
    const card = this.modal(
      "Indicators",
      `<input class="search-in" id="indQ" placeholder="Search ${INDICATORS.length} indicators…" autocomplete="off"><div class="list" id="indList"></div>`,
      {
        foot: '<span class="hint-text" style="margin-right:auto">No limit per chart. Write your own in the Indicator editor tab.</span><button class="btn" data-new>New custom indicator</button>',
      },
    );
    const q = card.querySelector("#indQ"),
      list = card.querySelector("#indList");
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const groups = {};
      for (const d of INDICATORS) {
        if (
          term &&
          !`${d.name} ${d.id} ${d.group}`.toLowerCase().includes(term)
        )
          continue;
        (groups[d.group || "Other"] ||= []).push(d);
      }
      list.innerHTML = Object.entries(groups)
        .sort(([g1], [g2]) => (g2 === "Quant (bonus)") - (g1 === "Quant (bonus)"))
        .map(
          ([g, ds]) =>
            `<div class="group ${g === "Quant (bonus)" ? "gold-text" : ""}">${esc(g)}</div>${ds.map((d) => `<div class="item" data-id="${esc(d.id)}"><span>${esc(d.name)}</span><span class="meta">${d.overlay ? "on price" : "own pane"}</span></div>`).join("")}`,
        )
        .join("");
    };
    q.oninput = draw;
    list.onclick = (e) => {
      const it = e.target.closest("[data-id]");
      if (!it) return;
      const uid = this.active.addIndicator(it.dataset.id);
      const anchor = (BY_ID[it.dataset.id].inputs || []).find((i) => i.type === "time");
      if (anchor) {
        this.closeModal();
        this.pickAnchor(this.active, uid, anchor.key);
      } else this.toast(`Added ${BY_ID[it.dataset.id].name}`);
    };
    card.querySelector("[data-new]").onclick = () => {
      this.closeModal();
      this.panels.showBottom("editor");
    };
    draw();
    q.focus();
  }

  /** Wait for a click on the chart and anchor indicator `uid` there (Anchored VWAP). Escape keeps the current anchor. */
  pickAnchor(pane, uid, key) {
    this.pendingAnchor = { pane, uid, key };
    this.setTool("anchor-pick");
    this.toast("Click the bar to anchor it to.");
  }

  openIndicatorSettings(pane, ind) {
    const def = BY_ID[ind.id];
    const fields = (def.inputs || [])
      .map((i) => {
        const v = ind.params?.[i.key] ?? i.default;
        if (i.type === "source") {
          // Indicators on indicators: any output of another indicator on this chart can be the source.
          const others = pane.cfg.indicators
            .filter((x) => x.uid !== ind.uid && !String(x.params?.source || "").includes(ind.uid) && BY_ID[x.id]?.outputs.length)
            .flatMap((x) => BY_ID[x.id].outputs.map((o) => [`ind:${x.uid}:${o.key}`, `${(/\(([^)]+)\)$/.exec(BY_ID[x.id].name)?.[1].split(" / ")[0] || BY_ID[x.id].name)} ${pane.indicatorParamsLabel(x)}: ${o.label}`]));
          const price = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4", "hlcc4"].map((s) => `<option ${s === v ? "selected" : ""}>${s}</option>`).join("");
          const inds = others.map(([val, label]) => `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(label)}</option>`).join("");
          return `<label class="field">${esc(i.label)}<select data-k="${i.key}"><optgroup label="Price">${price}</optgroup>${inds ? `<optgroup label="Another indicator">${inds}</optgroup>` : ""}</select></label>`;
        }
        if (i.type === "select")
          return `<label class="field">${esc(i.label)}<select data-k="${i.key}">${i.options.map((s) => `<option ${s === v ? "selected" : ""}>${s}</option>`).join("")}</select></label>`;
        if (i.type === "time") {
          const local = v ? new Date((v - new Date(v * 1000).getTimezoneOffset() * 60) * 1000).toISOString().slice(0, 16) : "";
          return `<label class="field">${esc(i.label)}<input data-k="${i.key}" data-type="time" type="datetime-local" value="${local}"><button class="btn small" type="button" data-pick="${i.key}">Pick on chart</button></label>`;
        }
        return `<label class="field">${esc(i.label)}<input data-k="${i.key}" data-type="${i.type}" type="number" step="${i.type === "int" ? 1 : "any"}" value="${v}"></label>`;
      })
      .join("");
    const colors = def.outputs
      .map(
        (o) =>
          `<label class="field">${esc(o.label)}<input data-c="${o.key}" type="color" value="${(ind.colors?.[o.key] || o.color).slice(0, 7)}"></label>`,
      )
      .join("");
    const card = this.modal(
      def.name,
      `<div class="form-grid">${fields || '<span class="hint-text">No inputs.</span>'}<label class="field">Timeframe<select data-tf>${["", "5m", "15m", "1h", "4h", "1D", "1W", "1M"].map((t) => `<option value="${t}" ${(ind.tf || "") === t ? "selected" : ""}>${t || `Same as chart (${pane.cfg.tf})`}</option>`).join("")}</select></label></div><p class="hint-text">A higher timeframe shows its value once each of its bars has closed, so history never peeks ahead.</p>${colors ? `<h4>Colours</h4><div class="form-grid">${colors}</div>` : ""}`,
      {
        foot: '<button class="btn" data-reset>Defaults</button><button class="btn primary" data-ok>Apply</button>',
      },
    );
    card.querySelector("[data-ok]").onclick = () => {
      ind.params = {};
      card.querySelectorAll("[data-k]").forEach((el) => {
        ind.params[el.dataset.k] =
          el.dataset.type === "time"
            ? el.value
              ? Math.floor(new Date(el.value).getTime() / 1000)
              : 0
            : el.dataset.type
              ? Number(el.value)
              : el.value;
      });
      ind.colors = {};
      card.querySelectorAll("[data-c]").forEach((el) => {
        ind.colors[el.dataset.c] = el.value;
      });
      ind.tf = card.querySelector("[data-tf]").value || undefined;
      this.closeModal();
      pane.render(false);
      this.persist();
    };
    card.querySelectorAll("[data-pick]").forEach((b) => {
      b.onclick = () => {
        this.closeModal();
        this.pickAnchor(pane, ind.uid, b.dataset.pick);
      };
    });
    card.querySelector("[data-reset]").onclick = () => {
      ind.params = {};
      ind.colors = {};
      this.closeModal();
      pane.render(false);
      this.persist();
    };
  }

  openSettings() {
    const s = this.settings;
    const card = this.modal(
      "Settings",
      `<div class="form-grid">
      <label class="field">Bars to load per chart<input id="sBars" type="number" min="200" max="20000" step="100" value="${s.bars}"></label>
      <label class="field">Time axis<select id="sUtc"><option value="0" ${!s.utc ? "selected" : ""}>My local time</option><option value="1" ${s.utc ? "selected" : ""}>UTC</option></select></label>
      <label class="field">Volume on the price chart<select id="sVol"><option value="1" ${s.volume ? "selected" : ""}>Show</option><option value="0" ${!s.volume ? "selected" : ""}>Hide</option></select></label>
      <label class="field">After placing a drawing<select id="sStay"><option value="0" ${!s.stayInDrawMode ? "selected" : ""}>Back to cursor</option><option value="1" ${s.stayInDrawMode ? "selected" : ""}>Keep the tool</option></select></label>
      <label class="field">Crosshair across charts<select id="sSync"><option value="0" ${!s.syncCrosshair ? "selected" : ""}>Independent</option><option value="1" ${s.syncCrosshair ? "selected" : ""}>Synced</option></select></label>
    </div><p class="hint-text">Everything you save lives in the <code>data</code> folder next to the app, on your machine.</p>`,
      { foot: '<button class="btn primary" data-ok>Save</button>' },
    );
    card.querySelector("[data-ok]").onclick = () => {
      Object.assign(s, {
        bars: Math.max(200, Math.min(20000, Number($("#sBars").value) || 3000)),
        utc: $("#sUtc").value === "1",
        volume: $("#sVol").value === "1",
        stayInDrawMode: $("#sStay").value === "1",
        syncCrosshair: $("#sSync").value === "1",
      });
      this.closeModal();
      this.persist();
      this.panes.forEach((p) => p.load({ keepView: true }));
    };
  }

  syncCrosshair(src, p) {
    const utc = src.timeOfLogical(p.logical);
    for (const pane of this.panes) {
      if (pane === src || !pane.shown.length) continue;
      const l = pane.logicalOf(utc);
      const i = Math.max(0, Math.min(pane.shown.length - 1, Math.round(l)));
      const b = pane.shown[i];
      if (b) pane.chart.setCrosshairPosition(b.close, pane.times[i], pane.main);
    }
  }

  exportCsv() {
    const p = this.active;
    const extra = {};
    for (const ind of p.cfg.indicators) {
      const def = BY_ID[ind.id];
      const res = p.indResults[ind.uid] || {};
      for (const o of def?.outputs || [])
        if (Array.isArray(res[o.key])) extra[`${ind.id}_${o.key}`] = res[o.key];
    }
    download(`${ticker(p.cfg.symbol)}-${p.cfg.tf}.csv`, toCsv(p.shown, extra));
  }

  // ---------- keys ----------
  bindKeys() {
    document.addEventListener("keydown", (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(
        document.activeElement?.tagName,
      );
      if (e.key === "Escape") {
        if (!$("#modal").classList.contains("hidden")) return this.closeModal();
        if (this.tool !== "cursor") return this.setTool("cursor");
        if (this.active?.selectedPattern) return this.active.selectPattern(null);
        const full = this.panes.find((p) => p.el.classList.contains("max"));
        if (full) return this.paneAction(full, "maxchart");
        if (this.active?.drawings.selected) {
          this.active.drawings.selected = null;
          this.active.drawings.update();
        }
        return;
      }
      // Alt+1..4 pick 1h, 1D, 1W, 1M in the toolbar's order; Alt+[ and Alt+] step back and forward through them.
      // (Plain letters are taken: typing starts a symbol search.)
      if (e.altKey && !typing && !e.ctrlKey && !e.metaKey && this.active) {
        const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
        let tf = digit ? TF_QUICK[Number(digit) - 1] : null;
        if (e.code === "BracketLeft" || e.code === "BracketRight") {
          const at = TF_QUICK.indexOf(this.active.cfg.tf);
          if (at >= 0) tf = TF_QUICK[(at + (e.code === "BracketRight" ? 1 : -1) + TF_QUICK.length) % TF_QUICK.length];
        }
        if (tf) {
          e.preventDefault();
          this.setTf(tf);
          return;
        }
      }
      if (!typing && (e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(e.key)) {
        e.preventDefault();
        this.stepDrawings(e.key.toLowerCase() === "y" || e.shiftKey);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        this.active?.deleteSelectedDrawing()
      ) {
        e.preventDefault();
        return;
      }
      if (!$("#modal").classList.contains("hidden")) return;
      if (/^[a-z0-9^]$/i.test(e.key)) {
        e.preventDefault();
        this.openSymbolSearch(e.key.toUpperCase());
      }
    });
  }

  // A drawn line as an alert condition: trend lines and rays are checked at the line's price on
  // each bar, on the server, so they fire with this tab closed.
  lineOperandFor(d) {
    const [a, b] = d.points;
    const line = (extend, label) => ({ kind: "line", label, line: { t1: a.time, p1: a.price, t2: b.time, p2: b.price, extend } });
    switch (d.type) {
      case "hline": return { kind: "value", v: Number(a.price.toPrecision(8)) };
      case "hray": return { kind: "line", label: "Horizontal ray", line: { t1: a.time, p1: a.price, t2: a.time + 1, p2: a.price, extend: "right" } };
      case "trend": return line("none", "Trend line (between its two points)");
      case "ray": return line("right", "Ray");
      case "extended": return line("both", "Extended line");
      case "channel": return line("none", "Channel's first line");
      default: return null;
    }
  }

  alertOnSelectedDrawing() {
    const d = this.active?.drawings.selected;
    if (!d) return this.toast("Click a line on the chart first to select it.");
    const right = this.lineOperandFor(d);
    if (!right) return this.toast("Alerts work on trend lines, rays, extended and horizontal lines.");
    this.panels.openAlertDialog({ rules: [{ left: { kind: "price", field: "close" }, op: "crosses", right }] });
  }

  // ---------- replay across charts ----------
  syncReplayFrom(pane, bar) {
    if (!bar) return;
    const end = bar.time + parseTf(pane.cfg.tf).seconds;
    for (const p of this.panes) if (p !== pane && p.bars.length && !(p.replay && !p.replay.follower)) p.replayTo(end);
  }
  onReplayStart(pane) {
    if (this.settings.syncReplay && !pane.replay?.follower) this.syncReplayFrom(pane, pane.bars[pane.replay.index]);
    this.syncToolbar();
    this.panels?.onReplayChange?.();
  }
  onReplayBar(pane, bar) {
    if (this.settings.syncReplay && !pane.replay?.follower) this.syncReplayFrom(pane, bar);
    this.panels?.onReplayBar?.(pane, bar);
  }
  onReplayStop(pane) {
    for (const p of this.panes) if (p !== pane && p.replay?.follower) p.stopReplay();
    this.syncToolbar();
    this.panels?.onReplayChange?.();
  }

  // ---------- prices, alerts, status ----------
  onPrice(symbol, price) {
    this.prices[symbol] = price;
    for (const fn of this.priceListeners) fn(symbol, price);
  }

  listenAlerts() {
    const es = new EventSource("/api/events");
    es.addEventListener("alert", (m) => {
      const e = JSON.parse(m.data);
      this.toast(`<b>Alert</b><br>${esc(e.text)}`, "alert", 12000);
      this.beep();
      if ("Notification" in window && Notification.permission === "granted")
        new Notification("Quant Terminal alert", { body: e.text });
      this.panels?.onAlertFired?.(e);
    });
  }

  // a chart pattern broke out, reached its target or failed (the chart's own check, so it works while the tab is open)
  patternAlert(text) {
    this.toast(`<b>Pattern</b><br>${esc(text)}`, "alert", 12000);
    this.beep();
    if ("Notification" in window && Notification.permission === "granted") new Notification("Quant Terminal pattern", { body: text });
  }

  beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.start();
      o.stop(ctx.currentTime + 0.25);
    } catch {
      /* no audio */
    }
  }

  async checkHealth() {
    try {
      const h = await api.get("/api/health");
      const failing = Object.entries(h.providers || {})
        .filter(([, v]) => !v.ok)
        .map(([k]) => k);
      this.setStatus(
        failing.length ? "warn" : "ok",
        failing.length
          ? `Some sources are failing (${failing.join(", ")}); fallbacks are in use.`
          : "All data sources responding",
      );
    } catch {
      this.setStatus(
        "bad",
        "The local server is not responding. Is it still running?",
      );
    }
  }
  setStatus(level, title) {
    const el = $("#status");
    el.className = `status ${level}`;
    if (title) el.title = title;
  }

  toast(html, kind = "", ms = 3500) {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), ms);
  }
}

const app = new App();
window.app = app;
app.init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="toast err" style="position:fixed;left:20px;bottom:20px">Startup failed: ${esc(e.message)}</div>`,
  );
});
