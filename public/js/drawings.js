// Drawing tools, rendered as a Lightweight Charts series primitive. Points are stored as
// { time (UTC seconds), price } so drawings stay put when you change timeframe.

import { VolumeProfile } from "./volume-profile.js";

export const TOOLS = [
  { id: "cursor", label: "Cursor", icon: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>' },
  {
    id: "trend",
    label: "Trend line",
    points: 2,
    icon: '<path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="5" r="1.6"/>',
  },
  {
    id: "ray",
    label: "Ray",
    points: 2,
    icon: '<path d="M4 19L21 4"/><circle cx="4" cy="19" r="1.6"/><circle cx="11" cy="13" r="1.6"/>',
  },
  {
    id: "extended",
    label: "Extended line",
    points: 2,
    icon: '<path d="M2 21L22 3"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="9" r="1.6"/>',
  },
  {
    id: "hline",
    label: "Horizontal line",
    points: 1,
    icon: '<path d="M3 12h18"/><circle cx="12" cy="12" r="1.6"/>',
  },
  {
    id: "hray",
    label: "Horizontal ray",
    points: 1,
    icon: '<path d="M8 12h13"/><circle cx="8" cy="12" r="1.6"/>',
  },
  {
    id: "vline",
    label: "Vertical line",
    points: 1,
    icon: '<path d="M12 3v18"/><circle cx="12" cy="12" r="1.6"/>',
  },
  {
    id: "channel",
    label: "Parallel channel",
    points: 3,
    icon: '<path d="M3 15L15 5M9 21l12-10"/>',
  },
  {
    id: "rect",
    label: "Rectangle",
    points: 2,
    icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  },
  {
    id: "fib",
    label: "Fib retracement",
    points: 2,
    icon: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18" stroke-dasharray="2 2"/>',
  },
  {
    id: "measure",
    label: "Price range / measure",
    points: 2,
    icon: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  },
  {
    id: "long",
    label: "Long position",
    points: 2,
    icon: '<rect x="4" y="5" width="16" height="7" fill="currentColor" fill-opacity=".25"/><rect x="4" y="12" width="16" height="7"/>',
  },
  {
    id: "short",
    label: "Short position",
    points: 2,
    icon: '<rect x="4" y="5" width="16" height="7"/><rect x="4" y="12" width="16" height="7" fill="currentColor" fill-opacity=".25"/>',
  },
  {
    id: "xabcd",
    label: "XABCD pattern",
    points: 5,
    icon: '<path d="M4 17l4-10 5 8 3-7 4 9"/>',
  },
  {
    id: "brush",
    label: "Brush (drag to draw)",
    points: 1,
    icon: '<path d="M4 18c3-8 5 2 8-6s4 0 8-6"/>',
  },
  {
    id: "zoom",
    label: "Zoom in (click two corners)",
    points: 2,
    icon: '<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5M10 7v6M7 10h6"/>',
  },
  { id: "eraser", label: "Eraser (click a drawing)", points: 1, icon: '<path d="M7 20h11M5 15l9-9 5 5-6 6H8z"/>' },
  { id: "arrow", label: "Arrow", points: 2, icon: '<path d="M4 20L19 5M19 5h-7M19 5v7"/>' },
  { id: "info", label: "Info line", points: 2, icon: '<path d="M4 19L18 6"/><rect x="12" y="12" width="9" height="6" rx="1"/>' },
  { id: "angle", label: "Trend angle", points: 2, icon: '<path d="M4 19L19 7M4 19h16"/><path d="M11 19a7 7 0 0 0-2-4"/>' },
  { id: "crossline", label: "Cross line", points: 1, icon: '<path d="M12 3v18M3 12h18"/>' },
  { id: "fibext", label: "Trend-based fib extension", points: 3, icon: '<path d="M4 20L10 6l5 10M4 8h16M4 13h16M4 18h16"/>' },
  { id: "highlighter", label: "Highlighter (drag)", points: 1, icon: '<path d="M5 19l2-5 9-9 3 3-9 9zM4 21h8"/>' },
  { id: "circle", label: "Circle", points: 2, icon: '<circle cx="12" cy="12" r="8"/>' },
  { id: "ellipse", label: "Ellipse", points: 2, icon: '<ellipse cx="12" cy="12" rx="9" ry="6"/>' },
  { id: "triangle", label: "Triangle", points: 3, icon: '<path d="M12 4l9 15H3z"/>' },
  { id: "note", label: "Note", points: 1, icon: '<path d="M5 4h14v12h-7l-4 4v-4H5z"/>' },
  { id: "pricelabel", label: "Price label", points: 1, icon: '<path d="M3 12l5-5h13v10H8z"/>' },
  { id: "arrowup", label: "Arrow marker up", points: 1, icon: '<path d="M12 20V6M6 12l6-6 6 6"/>' },
  { id: "arrowdown", label: "Arrow marker down", points: 1, icon: '<path d="M12 4v14M6 12l6 6 6-6"/>' },
  { id: "flag", label: "Flag mark", points: 1, icon: '<path d="M6 21V4M6 5h12l-3 4 3 4H6"/>' },
  { id: "abcd", label: "ABCD pattern", points: 4, icon: '<path d="M4 18l5-10 6 8 5-10"/>' },
  { id: "daterange", label: "Date range", points: 2, icon: '<path d="M5 5v14M19 5v14M5 12h14M8 9l-3 3 3 3M16 9l3 3-3 3"/>' },
  { id: "pricerange", label: "Price range", points: 2, icon: '<path d="M5 5h14M5 19h14M12 5v14M9 8l3-3 3 3M9 16l3 3 3-3"/>' },
  { id: "daterangeprice", label: "Date and price range", points: 2, icon: '<rect x="4" y="5" width="16" height="14"/><path d="M4 12h16M12 5v14"/>' },
  { id: "regression", label: "Regression trend", points: 2, icon: '<path d="M4 17L20 8M4 12L20 3M4 22L20 13" stroke-dasharray="2 2"/><path d="M4 17L20 8"/>' },
  { id: "flat", label: "Flat top/bottom", points: 3, icon: '<path d="M4 19L18 8M4 6h14"/>' },
  { id: "rotated", label: "Rotated rectangle", points: 3, icon: '<path d="M4 14l10-8 6 6-10 8z"/>' },
  { id: "polyline", label: "Polyline (double-click to finish)", points: 50, icon: '<path d="M4 18l5-9 5 6 6-10"/>' },
  { id: "callout", label: "Callout", points: 2, icon: '<path d="M5 19l6-7M11 12h8V5h-8z"/>' },
  { id: "signpost", label: "Signpost", points: 1, icon: '<path d="M7 21V4M7 5h11l-2 3 2 3H7"/>' },
  { id: "pricenote", label: "Price note", points: 1, icon: '<path d="M4 20l7-7M11 13h9V6h-9z"/>' },
  { id: "headshoulders", label: "Head and shoulders", points: 7, icon: '<path d="M3 18l3-6 3 3 3-9 3 9 3-3 3 6M4 15h16"/>' },
  { id: "cyclic", label: "Cyclic lines", points: 2, icon: '<path d="M5 4v16M11 4v16M17 4v16"/>' },
  { id: "timecycles", label: "Time cycles", points: 2, icon: '<path d="M3 16a4 5 0 0 1 8 0M11 16a4 5 0 0 1 8 0"/>' },
  { id: "forecast", label: "Forecast", points: 2, icon: '<path d="M4 18l8-6 7-7M19 5h-6M19 5v6"/><circle cx="12" cy="12" r="1.5"/>' },
  { id: "pitchfork", label: "Pitchfork", points: 3, icon: '<path d="M5 19L19 5M9 19l10-10M5 15L15 5"/>' },
  { id: "schiff", label: "Schiff pitchfork", points: 3, icon: '<path d="M5 19L19 8M9 19l10-8M5 15l10-7"/>' },
  { id: "mschiff", label: "Modified Schiff pitchfork", points: 3, icon: '<path d="M6 18L19 9M10 19l9-6M5 14l9-6"/>' },
  { id: "pitchfan", label: "Pitchfan", points: 3, icon: '<path d="M5 19L19 5M5 19L19 10M5 19L19 15M5 19h14"/>' },
  { id: "fibchannel", label: "Fib channel", points: 3, icon: '<path d="M4 19L18 11M4 15L18 7M4 11L18 3"/>' },
  { id: "fibtimezone", label: "Fib time zone", points: 2, icon: '<path d="M5 4v16M8 4v16M12 4v16M19 4v16"/>' },
  { id: "trendfibtime", label: "Trend-based fib time", points: 3, icon: '<path d="M4 18l5-9M12 4v16M16 4v16M20 4v16"/>' },
  { id: "fibcircles", label: "Fib circles", points: 2, icon: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9"/>' },
  { id: "fibspiral", label: "Fib spiral", points: 2, icon: '<path d="M12 12a2 2 0 0 1 3 0 4 4 0 0 1-5 4 7 7 0 0 1-5-8 11 11 0 0 1 14 2"/>' },
  { id: "fibarcs", label: "Fib speed resistance arcs", points: 2, icon: '<path d="M6 18a6 6 0 0 1 0-12M6 21a9 9 0 0 1 0-18M6 24a12 12 0 0 1 0-24"/>' },
  { id: "fibwedge", label: "Fib wedge", points: 3, icon: '<path d="M5 19L19 6M5 19L19 14M9 14.5a6 6 0 0 1 8-3.5"/>' },
  { id: "fibfan", label: "Fib speed resistance fan", points: 2, icon: '<path d="M5 19L19 5M5 19l14-9M5 19l14-5"/>' },
  { id: "gannbox", label: "Gann box", points: 2, icon: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16M4 20L20 4M12 4v16M4 12h16"/>' },
  { id: "gannsquare", label: "Gann square", points: 2, icon: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16M12 4v16M4 12h16"/>' },
  { id: "gannfan", label: "Gann fan", points: 2, icon: '<path d="M5 19L19 5M5 19l14-4M5 19l14-9M5 19l9-14M5 19l4-14"/>' },
  { id: "elliottimpulse", label: "Elliott impulse wave (12345)", points: 6, icon: '<path d="M3 19l4-6 3 3 5-10 2 5 4-4"/>' },
  { id: "elliottcorrection", label: "Elliott correction wave (ABC)", points: 4, icon: '<path d="M4 6l6 10 3-5 7 9"/>' },
  { id: "elliotttriangle", label: "Elliott triangle wave (ABCDE)", points: 6, icon: '<path d="M3 8l4 8 4-6 3 5 3-3 3 2"/>' },
  { id: "elliottdouble", label: "Elliott double combo wave (WXY)", points: 4, icon: '<path d="M3 8l5 9 3-5 8 7"/>' },
  { id: "elliotttriple", label: "Elliott triple combo wave (WXYXZ)", points: 6, icon: '<path d="M3 7l4 9 3-4 4 7 3-6 3 3"/>' },
  { id: "cypher", label: "Cypher pattern", points: 5, icon: '<path d="M4 16l5-10 4 6 3-8 4 12"/>' },
  { id: "trianglepattern", label: "Triangle pattern", points: 4, icon: '<path d="M4 8l5 10 5-7 6 4M4 8l16 9M9 18l11-7" />' },
  { id: "threedrives", label: "Three drives pattern", points: 7, icon: '<path d="M3 19l3-9 2 5 3-9 2 5 3-8 3 8"/>' },
  { id: "sine", label: "Sine line", points: 2, icon: '<path d="M3 12c3-9 6-9 9 0s6 9 9 0"/>' },
  { id: "balloon", label: "Balloon", points: 2, icon: '<path d="M6 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-6l-4 5v-5H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>' },
  { id: "arrowleft", label: "Arrow mark left", points: 1, icon: '<path d="M20 12H5M11 6l-6 6 6 6"/>' },
  { id: "arrowright", label: "Arrow mark right", points: 1, icon: '<path d="M4 12h15M13 6l6 6-6 6"/>' },
  { id: "curve", label: "Curve", points: 3, icon: '<path d="M4 18Q12 2 20 18"/>' },
  { id: "doublecurve", label: "Double curve", points: 2, icon: '<path d="M4 18C12 18 12 6 20 6"/>' },
  { id: "arc", label: "Arc", points: 3, icon: '<path d="M4 18a9 9 0 0 1 16 0"/>' },
  { id: "path", label: "Path (double-click to finish)", points: 50, icon: '<path d="M4 18l6-9 5 5 5-9M20 5h-5M20 5v5"/>' },
  { id: "projection", label: "Projection", points: 3, icon: '<path d="M4 18l6-7M12 18l7-7M19 11h-5M19 11v5"/>' },
  { id: "fixedvp", label: "Fixed range volume profile", points: 2, icon: '<path d="M5 5h8M5 9h12M5 13h6M5 17h10M5 4v14"/>' },
  { id: "barspattern", label: "Bars pattern", points: 3, icon: '<path d="M4 18v-6M8 18V8M12 18v-4M16 14v-8M20 18v-7"/>' },
  { id: "emoji_star", label: "Icon star", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">⭐</text>' },
  { id: "emoji_thumbsup", label: "Icon thumbsup", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">👍</text>' },
  { id: "emoji_thumbsdown", label: "Icon thumbsdown", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">👎</text>' },
  { id: "emoji_warning", label: "Icon warning", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">⚠️</text>' },
  { id: "emoji_check", label: "Icon check", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">✅</text>' },
  { id: "emoji_cross", label: "Icon cross", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">❌</text>' },
  { id: "emoji_fire", label: "Icon fire", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">🔥</text>' },
  { id: "emoji_money", label: "Icon money", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">💰</text>' },
  { id: "emoji_rocket", label: "Icon rocket", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">🚀</text>' },
  { id: "emoji_chartup", label: "Icon chartup", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">📈</text>' },
  { id: "emoji_chartdown", label: "Icon chartdown", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">📉</text>' },
  { id: "emoji_bull", label: "Icon bull", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">🐂</text>' },
  { id: "emoji_bear", label: "Icon bear", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">🐻</text>' },
  { id: "emoji_eyes", label: "Icon eyes", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">👀</text>' },
  { id: "emoji_bell", label: "Icon bell", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">🔔</text>' },
  { id: "emoji_redflag", label: "Icon redflag", points: 1, icon: '<text x="12" y="17.5" font-size="15" text-anchor="middle">🚩</text>' },
  { id: "dot", label: "Dot", points: 0, icon: '<circle cx="12" cy="12" r="3" fill="currentColor"/>' },
  { id: "arrowcursor", label: "Arrow", points: 0, icon: '<path d="M6 3l12 8-5 1.5L10.5 18z"/>' },
  { id: "disjoint", label: "Disjoint channel", points: 4, icon: '<path d="M4 17L14 12M6 8l14-4"/>' },
  { id: "insidepitchfork", label: "Inside pitchfork", points: 3, icon: '<path d="M5 19L19 5M9 19l10-10M5 15L15 5M7 17L17 7"/>' },
  { id: "gannsquarefixed", label: "Gann square fixed", points: 2, icon: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16M12 4v16M4 12h16M4 8h16M8 4v16"/>' },
  { id: "arrowmarker", label: "Arrow marker", points: 2, icon: '<path d="M4 20l9-9M13 11l-1 6 8-13-13 8z" fill="currentColor"/>' },
  { id: "anchoredtext", label: "Anchored text", points: 1, icon: '<path d="M5 6h14M12 6v13M9 19h6"/><circle cx="19" cy="19" r="1.4" fill="currentColor"/>' },
  { id: "anchorednote", label: "Anchored note", points: 1, icon: '<path d="M5 4h14v11h-6l-3 3v-3H5z"/><circle cx="19" cy="20" r="1.4" fill="currentColor"/>' },
  {
    id: "text",
    label: "Text note",
    points: 1,
    icon: '<path d="M5 6h14M12 6v13"/>',
  },
];
export const EMOJI_CHAR = {
  emoji_star: "⭐",
  emoji_thumbsup: "👍",
  emoji_thumbsdown: "👎",
  emoji_warning: "⚠️",
  emoji_check: "✅",
  emoji_cross: "❌",
  emoji_fire: "🔥",
  emoji_money: "💰",
  emoji_rocket: "🚀",
  emoji_chartup: "📈",
  emoji_chartdown: "📉",
  emoji_bull: "🐂",
  emoji_bear: "🐻",
  emoji_eyes: "👀",
  emoji_bell: "🔔",
  emoji_redflag: "🚩",
};
const WAVES = {
  elliottimpulse: ["0", "1", "2", "3", "4", "5"],
  elliottcorrection: ["0", "A", "B", "C"],
  elliotttriangle: ["0", "A", "B", "C", "D", "E"],
  elliottdouble: ["0", "W", "X", "Y"],
  elliotttriple: ["0", "W", "X", "Y", "X", "Z"],
  cypher: ["X", "A", "B", "C", "D"],
  threedrives: ["0", "1", "2", "3", "4", "5", "6"],
};
const FIB = [0.382, 0.5, 0.618, 1, 1.382, 1.618];
export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];

const COLORS = {
  line: "#2962ff",
  fib: "#787b86",
  up: "rgba(8,153,129,",
  down: "rgba(242,54,69,",
};

export class DrawingLayer {
  constructor(pane) {
    this.pane = pane;
    this.items = [];
    this.temp = null;
    this.selected = null;
    this._view = {
      zOrder: () => "top",
      renderer: () => ({
        draw: (target) =>
          target.useMediaCoordinateSpace(({ context, mediaSize }) =>
            this.draw(context, mediaSize),
          ),
      }),
    };
  }

  // --- ISeriesPrimitive ---
  attached({ series, requestUpdate }) {
    this.series = series;
    this.requestUpdate = requestUpdate;
  }
  detached() {
    this.series = null;
  }
  updateAllViews() {}
  paneViews() {
    return [this._view];
  }
  update() {
    this.requestUpdate?.();
  }

  x(t) {
    return this.pane.timeToX(t);
  }
  y(p) {
    return this.series?.priceToCoordinate(p) ?? null;
  }

  setItems(items) {
    this.items = items || [];
    this.selected = null;
    this.update();
  }

  draw(ctx, size) {
    if (this.pane.app?.hideDrawings) return;
    ctx.save();
    ctx.font = "11.5px Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif";
    for (const d of [...this.items, ...(this.temp ? [this.temp] : [])]) {
      try {
        this.drawOne(ctx, size, d, d === this.selected || d === this.temp);
      } catch {
        /* off-screen */
      }
    }
    ctx.restore();
  }

  drawOne(ctx, size, d, active) {
    const pts = d.points.map((p) => ({
      x: this.x(p.time),
      y: this.y(p.price),
      ...p,
    }));
    if (pts.some((p) => p.x == null || p.y == null)) return;
    const color = d.color || COLORS.line;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.setLineDash([]);
    const [a, b, c] = pts;
    const line = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const label = (txt, x, y, align = "left", bg = null) => {
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      if (bg) {
        const w = ctx.measureText(txt).width + 10;
        ctx.fillStyle = bg;
        ctx.fillRect(
          align === "center" ? x - w / 2 : align === "right" ? x - w : x,
          y - 9,
          w,
          18,
        );
        ctx.fillStyle = "#fff";
        ctx.fillText(
          txt,
          align === "center" ? x : align === "right" ? x - 5 : x + 5,
          y,
        );
        ctx.fillStyle = color;
      } else ctx.fillText(txt, x, y);
    };
    const extend = (p, q, both) => {
      const dx = q.x - p.x,
        dy = q.y - p.y;
      if (dx === 0 && dy === 0) return [p, q];
      const far = 1e5;
      const len = Math.hypot(dx, dy);
      const e2 = { x: p.x + (dx / len) * far, y: p.y + (dy / len) * far };
      const e1 = both
        ? { x: p.x - (dx / len) * far, y: p.y - (dy / len) * far }
        : p;
      return [e1, e2];
    };
    const price = (v) => this.pane.formatPrice(v);

    switch (d.type) {
      case "trend":
        line(a.x, a.y, b.x, b.y);
        break;
      case "regression": {
        const T = this.pane.shown,
          ts = this.pane.chart.timeScale();
        let i1 = Math.round(this.pane.logicalOf(a.time)),
          i2 = Math.round(this.pane.logicalOf(b.time));
        if (i1 > i2) [i1, i2] = [i2, i1];
        i1 = Math.max(0, i1);
        i2 = Math.min(T.length - 1, i2);
        if (i2 - i1 < 2) {
          line(a.x, a.y, b.x, b.y);
          break;
        }
        const n = i2 - i1 + 1;
        let sx = 0,
          sy = 0,
          sxx = 0,
          sxy = 0;
        for (let i = i1; i <= i2; i++) {
          const x = i - i1,
            y = T[i].close;
          sx += x;
          sy += y;
          sxx += x * x;
          sxy += x * y;
        }
        const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx),
          icpt = (sy - slope * sx) / n;
        let ss = 0;
        for (let i = i1; i <= i2; i++) ss += (T[i].close - (icpt + slope * (i - i1))) ** 2;
        const sd = Math.sqrt(ss / n),
          xa = ts.logicalToCoordinate(i1),
          xb = ts.logicalToCoordinate(i2),
          m1 = icpt,
          m2 = icpt + slope * (i2 - i1);
        const yy = (v) => this.y(v);
        ctx.globalAlpha = 0.08;
        ctx.beginPath();
        ctx.moveTo(xa, yy(m1 + 2 * sd));
        ctx.lineTo(xb, yy(m2 + 2 * sd));
        ctx.lineTo(xb, yy(m2 - 2 * sd));
        ctx.lineTo(xa, yy(m1 - 2 * sd));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        line(xa, yy(m1), xb, yy(m2));
        ctx.setLineDash([5, 4]);
        line(xa, yy(m1 + 2 * sd), xb, yy(m2 + 2 * sd));
        line(xa, yy(m1 - 2 * sd), xb, yy(m2 - 2 * sd));
        ctx.setLineDash([]);
        break;
      }
      case "flat": {
        line(a.x, a.y, b.x, b.y);
        if (!c) break;
        line(a.x, c.y, b.x, c.y);
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x, c.y);
        ctx.lineTo(a.x, c.y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case "rotated": {
        if (!c) {
          line(a.x, a.y, b.x, b.y);
          break;
        }
        const ux = b.x - a.x,
          uy = b.y - a.y,
          len = Math.hypot(ux, uy) || 1;
        const nx = -uy / len,
          ny = ux / len,
          off = (c.x - a.x) * nx + (c.y - a.y) * ny;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x + nx * off, b.y + ny * off);
        ctx.lineTo(a.x + nx * off, a.y + ny * off);
        ctx.closePath();
        ctx.globalAlpha = 0.12;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        break;
      }
      case "polyline":
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        break;
      case "callout":
        line(a.x, a.y, b.x, b.y);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
        ctx.fill();
        label(d.text || "Callout", b.x, b.y, "left", color);
        break;
      case "signpost":
        line(a.x, a.y, a.x, a.y - 34);
        label(d.text || "Signpost", a.x + 4, a.y - 34, "left", "#b8860b");
        break;
      case "pricenote":
        line(a.x, a.y, a.x + 14, a.y - 14);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
        ctx.fill();
        label(price(a.price), a.x + 14, a.y - 14, "left", "#b8860b");
        break;
      case "headshoulders": {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        if (pts.length >= 5) {
          const [e1, e2] = extend(pts[2], pts[4], true);
          ctx.setLineDash([5, 4]);
          line(e1.x, e1.y, e2.x, e2.y);
          ctx.setLineDash([]);
        }
        [[1, "Left shoulder"], [3, "Head"], [5, "Right shoulder"]].forEach(([i, t]) => pts[i] && label(t, pts[i].x, pts[i].y - 12, "center", color));
        break;
      }
      case "cyclic":
      case "timecycles": {
        const w = b.x - a.x;
        if (Math.abs(w) < 3) break;
        const lo = Math.min((0 - a.x) / w, (size.width - a.x) / w),
          hi = Math.max((0 - a.x) / w, (size.width - a.x) / w);
        for (let k = Math.max(Math.floor(lo), -200); k <= Math.min(Math.ceil(hi), 200); k++) {
          const x = a.x + k * w;
          if (d.type === "cyclic") line(x, 0, x, size.height);
          else {
            ctx.beginPath();
            ctx.ellipse(x + w / 2, a.y, Math.abs(w) / 2, Math.abs(w) / 3, 0, Math.PI, Math.PI * 2);
            ctx.stroke();
          }
        }
        break;
      }
      case "forecast": {
        const up = b.price >= a.price,
          dp = b.price - a.price,
          pct = a.price ? (dp / a.price) * 100 : 0;
        const bars = Math.round(this.pane.logicalOf(b.time) - this.pane.logicalOf(a.time));
        ctx.setLineDash([6, 4]);
        line(a.x, a.y, b.x, b.y);
        ctx.setLineDash([]);
        ctx.fillStyle = up ? "#089981" : "#f23645";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
        label(`${dp >= 0 ? "+" : ""}${price(dp)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) · ${bars} bars`, b.x + 8, b.y, "left", up ? "#089981" : "#f23645");
        ctx.fillStyle = color;
        break;
      }
      case "pitchfork":
      case "insidepitchfork":
      case "schiff":
      case "mschiff": {
        if (!c) {
          line(a.x, a.y, b.x, b.y);
          break;
        }
        const S = d.type === "pitchfork" || d.type === "insidepitchfork" ? a : d.type === "schiff" ? { x: a.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
        const dx = mid.x - S.x,
          dy = mid.y - S.y,
          len = Math.hypot(dx, dy) || 1;
        const ray = (p) => line(p.x, p.y, p.x + (dx / len) * 1e5, p.y + (dy / len) * 1e5);
        line(b.x, b.y, c.x, c.y);
        ray(S);
        ray(b);
        ray(c);
        if (d.type === "insidepitchfork") for (const t of [0.25, 0.75]) ray({ x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t });
        ctx.globalAlpha = 0.07;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + (dx / len) * 3000, b.y + (dy / len) * 3000);
        ctx.lineTo(c.x + (dx / len) * 3000, c.y + (dy / len) * 3000);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case "pitchfan": {
        if (!c) {
          line(a.x, a.y, b.x, b.y);
          break;
        }
        line(b.x, b.y, c.x, c.y);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const p = { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t };
          const [, e] = extend(a, p, false);
          line(a.x, a.y, e.x, e.y);
        }
        break;
      }
      case "fibchannel": {
        line(a.x, a.y, b.x, b.y);
        if (!c) break;
        const ux = b.x - a.x,
          uy = b.y - a.y,
          len = Math.hypot(ux, uy) || 1;
        const nx = -uy / len,
          ny = ux / len,
          off = (c.x - a.x) * nx + (c.y - a.y) * ny;
        for (const r of [0.382, 0.5, 0.618, 1, 1.618]) {
          line(a.x + nx * off * r, a.y + ny * off * r, b.x + nx * off * r, b.y + ny * off * r);
          label(String(r), b.x + nx * off * r + 4, b.y + ny * off * r, "left");
        }
        break;
      }
      case "fibtimezone":
      case "trendfibtime": {
        const tz = d.type === "fibtimezone";
        const base = b.x - a.x;
        if (Math.abs(base) < 2) break;
        const from = tz ? a : c || b;
        const steps = tz ? [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] : [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.618];
        if (!tz) {
          ctx.setLineDash([4, 4]);
          line(a.x, a.y, b.x, b.y);
          if (c) line(b.x, b.y, c.x, c.y);
          ctx.setLineDash([]);
        }
        for (const n of steps) {
          const x = from.x + n * base;
          if (x < -10 || x > size.width + 10) continue;
          line(x, 0, x, size.height);
          label(String(n), x + 3, 12, "left");
        }
        break;
      }
      case "fibcircles": {
        const cx = (a.x + b.x) / 2,
          cy = (a.y + b.y) / 2,
          R = Math.hypot(b.x - a.x, b.y - a.y) / 2;
        ctx.setLineDash([4, 4]);
        line(a.x, a.y, b.x, b.y);
        ctx.setLineDash([]);
        for (const r of [0.382, 0.5, 0.618, 1, 1.382, 1.618, 2]) {
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(R * r, 1), 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case "fibspiral": {
        const R0 = Math.hypot(b.x - a.x, b.y - a.y),
          th0 = Math.atan2(b.y - a.y, b.x - a.x),
          k = Math.log(1.618) / (Math.PI / 2);
        ctx.beginPath();
        for (let t = -8 * Math.PI; t <= 0; t += 0.08) {
          const r = R0 * Math.exp(k * t),
            px = a.x + r * Math.cos(th0 + t),
            py = a.y + r * Math.sin(th0 + t);
          t === -8 * Math.PI ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        break;
      }
      case "fibarcs": {
        const D = Math.hypot(b.x - a.x, b.y - a.y),
          t0 = Math.atan2(a.y - b.y, a.x - b.x) + Math.PI;
        ctx.setLineDash([4, 4]);
        line(a.x, a.y, b.x, b.y);
        ctx.setLineDash([]);
        for (const r of FIB) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, Math.max(D * r, 1), t0 - Math.PI / 2, t0 + Math.PI / 2);
          ctx.stroke();
        }
        break;
      }
      case "fibwedge": {
        if (!c) {
          line(a.x, a.y, b.x, b.y);
          break;
        }
        const t1 = Math.atan2(b.y - a.y, b.x - a.x),
          t2 = Math.atan2(c.y - a.y, c.x - a.x);
        let diff = t2 - t1;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const R = Math.hypot(b.x - a.x, b.y - a.y);
        ctx.setLineDash([4, 4]);
        line(a.x, a.y, b.x, b.y);
        line(a.x, a.y, c.x, c.y);
        ctx.setLineDash([]);
        for (const r of FIB) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, Math.max(R * r, 1), t1, t1 + diff, diff < 0);
          ctx.stroke();
        }
        break;
      }
      case "fibfan": {
        line(a.x, a.y, b.x, b.y);
        for (const r of [0.382, 0.5, 0.618]) {
          for (const p of [{ x: b.x, y: a.y + (b.y - a.y) * r }, { x: a.x + (b.x - a.x) * r, y: b.y }]) {
            const [, e] = extend(a, p, false);
            line(a.x, a.y, e.x, e.y);
          }
          label(String(r), b.x + 4, a.y + (b.y - a.y) * r, "left");
        }
        break;
      }
      case "gannbox":
      case "gannsquarefixed":
      case "gannsquare": {
        let x2 = b.x,
          y2 = b.y;
        if (d.type === "gannsquarefixed") {
          // a fixed ratio: every bar across is 0.5% of the starting price up or down
          const nb = Math.abs(this.pane.logicalOf(b.time) - this.pane.logicalOf(a.time));
          const yy = this.y(a.price + (b.price >= a.price ? 1 : -1) * nb * a.price * 0.005);
          if (yy != null) y2 = yy;
        }
        if (d.type === "gannsquare") {
          const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          x2 = a.x + Math.sign(b.x - a.x || 1) * side;
          y2 = a.y + Math.sign(b.y - a.y || 1) * side;
        }
        ctx.globalAlpha = 0.06;
        ctx.fillRect(a.x, a.y, x2 - a.x, y2 - a.y);
        ctx.globalAlpha = 1;
        ctx.strokeRect(a.x, a.y, x2 - a.x, y2 - a.y);
        line(a.x, a.y, x2, y2);
        if (d.type === "gannbox") line(a.x, y2, x2, a.y);
        ctx.setLineDash([3, 4]);
        for (const f of [0.25, 0.5, 0.75]) {
          line(a.x + (x2 - a.x) * f, a.y, a.x + (x2 - a.x) * f, y2);
          line(a.x, a.y + (y2 - a.y) * f, x2, a.y + (y2 - a.y) * f);
        }
        ctx.setLineDash([]);
        break;
      }
      case "gannfan": {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        if (Math.abs(dx) < 1) break;
        [["1x8", 1 / 8], ["1x4", 1 / 4], ["1x3", 1 / 3], ["1x2", 1 / 2], ["1x1", 1], ["2x1", 2], ["3x1", 3], ["4x1", 4], ["8x1", 8]].forEach(([t, f]) => {
          const [, e] = extend(a, { x: a.x + dx, y: a.y + dy * f }, false);
          line(a.x, a.y, e.x, e.y);
          label(t, Math.min(a.x + dx, size.width - 20), a.y + dy * f, "left");
        });
        break;
      }
      case "trianglepattern": {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        if (pts[2]) line(a.x, a.y, pts[2].x, pts[2].y);
        if (pts[3]) line(b.x, b.y, pts[3].x, pts[3].y);
        pts.forEach((p, i) => label("ABCD"[i], p.x, p.y - 10, "center", color));
        break;
      }
      case "sine": {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        if (Math.abs(dx) < 2) break;
        ctx.beginPath();
        for (let x = 0; x <= size.width; x += 3) {
          const y = a.y + dy * Math.sin(((x - a.x) / dx) * (Math.PI / 2));
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
      case "balloon": {
        const txt = d.text || "Balloon";
        const w = ctx.measureText(txt).width + 16;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y - 13, w, 26, 8);
        ctx.fill();
        line(a.x, a.y, b.x, b.y);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(txt, b.x + 8, b.y);
        ctx.fillStyle = color;
        break;
      }
      case "arrowleft":
      case "arrowright": {
        const sgn = d.type === "arrowright" ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - 13 * sgn, a.y - 9);
        ctx.lineTo(a.x - 13 * sgn, a.y - 3.5);
        ctx.lineTo(a.x - 28 * sgn, a.y - 3.5);
        ctx.lineTo(a.x - 28 * sgn, a.y + 3.5);
        ctx.lineTo(a.x - 13 * sgn, a.y + 3.5);
        ctx.lineTo(a.x - 13 * sgn, a.y + 9);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "curve":
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        if (c) ctx.quadraticCurveTo(b.x, b.y, c.x, c.y);
        else ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      case "doublecurve":
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, b.x, b.y);
        ctx.stroke();
        break;
      case "arc": {
        if (!c) {
          line(a.x, a.y, b.x, b.y);
          break;
        }
        const dd = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
        if (Math.abs(dd) < 1e-6) {
          line(a.x, a.y, c.x, c.y);
          break;
        }
        const sa = a.x * a.x + a.y * a.y,
          sb = b.x * b.x + b.y * b.y,
          sc = c.x * c.x + c.y * c.y;
        const ux = (sa * (b.y - c.y) + sb * (c.y - a.y) + sc * (a.y - b.y)) / dd,
          uy = (sa * (c.x - b.x) + sb * (a.x - c.x) + sc * (b.x - a.x)) / dd;
        const R = Math.hypot(a.x - ux, a.y - uy),
          ta = Math.atan2(a.y - uy, a.x - ux),
          tb = Math.atan2(b.y - uy, b.x - ux),
          tc = Math.atan2(c.y - uy, c.x - ux);
        const norm = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        ctx.beginPath();
        ctx.arc(ux, uy, R, ta, tc, !(norm(tb - ta) < norm(tc - ta)));
        ctx.stroke();
        break;
      }
      case "path": {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        if (pts.length > 1) {
          const e = pts[pts.length - 1],
            f = pts[pts.length - 2],
            ang = Math.atan2(e.y - f.y, e.x - f.x);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x - 11 * Math.cos(ang - 0.4), e.y - 11 * Math.sin(ang - 0.4));
          ctx.lineTo(e.x - 11 * Math.cos(ang + 0.4), e.y - 11 * Math.sin(ang + 0.4));
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case "projection": {
        line(a.x, a.y, b.x, b.y);
        if (!c) break;
        const ex = c.x + (b.x - a.x),
          ey = c.y + (b.y - a.y);
        ctx.setLineDash([6, 4]);
        line(c.x, c.y, ex, ey);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fill();
        const dp = b.price - a.price;
        label(`${dp >= 0 ? "+" : ""}${price(dp)}`, ex + 8, ey, "left", color);
        break;
      }
      case "fixedvp": {
        const t1 = Math.min(a.time, b.time),
          t2 = Math.max(a.time, b.time);
        const inRange = this.pane.shown.filter((bar) => bar.time >= t1 && bar.time <= t2);
        const prof = inRange.length > 1 ? VolumeProfile.profile(inRange, 24, 70) : null;
        const x0 = Math.min(a.x, b.x),
          maxW = Math.max(40, Math.abs(b.x - a.x) * 0.8);
        ctx.setLineDash([3, 3]);
        line(x0, 0, x0, size.height);
        line(Math.max(a.x, b.x), 0, Math.max(a.x, b.x), size.height);
        ctx.setLineDash([]);
        if (!prof) break;
        prof.total.forEach((v, i) => {
          const y1 = this.y(prof.lo + prof.step * (i + 1)),
            y2 = this.y(prof.lo + prof.step * i);
          if (y1 == null || y2 == null) return;
          ctx.globalAlpha = i >= prof.vaLow && i <= prof.vaHigh ? 0.45 : 0.22;
          ctx.fillRect(x0, y1 + 0.5, (v / prof.max) * maxW, Math.max(1, y2 - y1 - 1));
        });
        ctx.globalAlpha = 1;
        const yp = this.y(prof.lo + prof.step * (prof.poc + 0.5));
        if (yp != null) line(x0, yp, x0 + maxW, yp);
        break;
      }
      case "barspattern": {
        const t1 = Math.min(a.time, b.time),
          t2 = Math.max(a.time, b.time);
        const inRange = this.pane.shown.filter((bar) => bar.time >= t1 && bar.time <= t2);
        if (inRange.length < 2 || !c) {
          line(a.x, a.y, b.x, b.y);
          break;
        }
        const x0 = this.x(inRange[0].time),
          p0 = inRange[0].close;
        ctx.beginPath();
        inRange.forEach((bar, i) => {
          const px = c.x + (this.x(bar.time) - x0),
            py = this.y(c.price + (bar.close - p0));
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.stroke();
        break;
      }
      case "elliottimpulse":
      case "elliottcorrection":
      case "elliotttriangle":
      case "elliottdouble":
      case "elliotttriple":
      case "cypher":
      case "threedrives": {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        if (d.type === "cypher" && pts[3]) {
          ctx.setLineDash([4, 4]);
          line(pts[0].x, pts[0].y, pts[3].x, pts[3].y);
          if (pts[4]) line(pts[1].x, pts[1].y, pts[4].x, pts[4].y);
          ctx.setLineDash([]);
        }
        pts.forEach((p, i) => {
          const up = (!pts[i - 1] || p.y < pts[i - 1].y) && (!pts[i + 1] || p.y < pts[i + 1].y);
          label(WAVES[d.type][i] || "", p.x, p.y + (up ? -12 : 12), "center", color);
        });
        break;
      }
      case "disjoint": {
        line(a.x, a.y, b.x, b.y);
        if (!c) break;
        const e = pts[3] || c;
        line(c.x, c.y, e.x, e.y);
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(e.x, e.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case "arrowmarker": {
        const ang = Math.atan2(b.y - a.y, b.x - a.x),
          len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 2) break;
        const head = Math.min(20, len * 0.55),
          sw = 5,
          nx = -Math.sin(ang),
          ny = Math.cos(ang),
          bx = b.x - Math.cos(ang) * head,
          by = b.y - Math.sin(ang) * head;
        ctx.beginPath();
        ctx.moveTo(a.x + (nx * sw) / 2, a.y + (ny * sw) / 2);
        ctx.lineTo(bx + (nx * sw) / 2, by + (ny * sw) / 2);
        ctx.lineTo(bx + nx * head * 0.6, by + ny * head * 0.6);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(bx - nx * head * 0.6, by - ny * head * 0.6);
        ctx.lineTo(bx - (nx * sw) / 2, by - (ny * sw) / 2);
        ctx.lineTo(a.x - (nx * sw) / 2, a.y - (ny * sw) / 2);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "anchoredtext":
      case "anchorednote": {
        // pinned to a spot on the pane (a share of its width and height), so it stays put as the chart moves
        const ax = (d.fx ?? 0.5) * size.width,
          ay = (d.fy ?? 0.5) * size.height;
        if (d.type === "anchorednote") label(d.text || "Note", ax, ay, "left", "#b8860b");
        else {
          ctx.save();
          ctx.font = "13px Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(d.text || "Text", ax, ay);
          ctx.restore();
        }
        break;
      }
      case "arrow": {
        line(a.x, a.y, b.x, b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x),
          h = 11;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - h * Math.cos(ang - 0.4), b.y - h * Math.sin(ang - 0.4));
        ctx.lineTo(b.x - h * Math.cos(ang + 0.4), b.y - h * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "info":
      case "angle": {
        line(a.x, a.y, b.x, b.y);
        const dp = b.price - a.price,
          pct = a.price ? (dp / a.price) * 100 : 0;
        const bars = Math.round(this.pane.logicalOf(b.time) - this.pane.logicalOf(a.time));
        const mx = (a.x + b.x) / 2,
          my = (a.y + b.y) / 2 - 14;
        if (d.type === "angle") {
          ctx.setLineDash([4, 4]);
          line(a.x, a.y, b.x, a.y);
          ctx.setLineDash([]);
          label(`${((Math.atan2(a.y - b.y, b.x - a.x) * 180) / Math.PI).toFixed(1)}°`, mx, my, "center", color);
        } else label(`${dp >= 0 ? "+" : ""}${price(dp)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) · ${bars} bars`, mx, my, "center", color);
        break;
      }
      case "crossline":
        line(0, a.y, size.width, a.y);
        line(a.x, 0, a.x, size.height);
        break;
      case "circle":
      case "ellipse": {
        const circ = d.type === "circle";
        const rx = circ ? Math.hypot(b.x - a.x, b.y - a.y) : Math.abs(b.x - a.x) / 2;
        const ry = circ ? rx : Math.abs(b.y - a.y) / 2;
        ctx.beginPath();
        ctx.ellipse(circ ? a.x : (a.x + b.x) / 2, circ ? a.y : (a.y + b.y) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.globalAlpha = 0.12;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        break;
      }
      case "triangle": {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (pts.length > 2) {
          ctx.closePath();
          ctx.globalAlpha = 0.12;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.stroke();
        break;
      }
      case "highlighter": {
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = d.color || "#ffd54a";
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineCap = "butt";
        break;
      }
      case "note":
        label(d.text || "Note", a.x, a.y, "left", "#b8860b");
        break;
      case "pricelabel":
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
        ctx.fill();
        label(price(a.price), a.x + 4, a.y, "left", color);
        break;
      case "arrowup":
      case "arrowdown": {
        const sgn = d.type === "arrowup" ? 1 : -1;
        ctx.fillStyle = sgn > 0 ? "#089981" : "#f23645";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - 9, a.y + 13 * sgn);
        ctx.lineTo(a.x - 3.5, a.y + 13 * sgn);
        ctx.lineTo(a.x - 3.5, a.y + 26 * sgn);
        ctx.lineTo(a.x + 3.5, a.y + 26 * sgn);
        ctx.lineTo(a.x + 3.5, a.y + 13 * sgn);
        ctx.lineTo(a.x + 9, a.y + 13 * sgn);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        break;
      }
      case "flag":
        line(a.x, a.y, a.x, a.y - 26);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - 26);
        ctx.lineTo(a.x + 16, a.y - 20);
        ctx.lineTo(a.x, a.y - 14);
        ctx.closePath();
        ctx.fill();
        break;
      case "abcd":
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        ctx.setLineDash([4, 4]);
        for (const [i, j] of [[0, 2], [1, 3]]) if (pts[j]) line(pts[i].x, pts[i].y, pts[j].x, pts[j].y);
        ctx.setLineDash([]);
        pts.forEach((p, i) => label("ABCD"[i], p.x, p.y - 10, "center", color));
        break;
      case "daterange":
      case "pricerange":
      case "daterangeprice": {
        const x1 = Math.min(a.x, b.x),
          x2 = Math.max(a.x, b.x),
          y1 = Math.min(a.y, b.y),
          y2 = Math.max(a.y, b.y);
        const withX = d.type !== "pricerange",
          withY = d.type !== "daterange";
        const rx1 = withX ? x1 : 0,
          rx2 = withX ? x2 : size.width,
          ry1 = withY ? y1 : 0,
          ry2 = withY ? y2 : size.height;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(rx1, ry1, rx2 - rx1, ry2 - ry1);
        ctx.globalAlpha = 1;
        if (withX) {
          line(x1, ry1, x1, ry2);
          line(x2, ry1, x2, ry2);
        }
        if (withY) {
          line(rx1, y1, rx2, y1);
          line(rx1, y2, rx2, y2);
        }
        const bars = Math.round(Math.abs(this.pane.logicalOf(b.time) - this.pane.logicalOf(a.time)));
        const days = Math.round(Math.abs(b.time - a.time) / 86400);
        const dp = b.price - a.price,
          pct = a.price ? (dp / a.price) * 100 : 0;
        const txt = [withX ? `${bars} bars, ${days} d` : null, withY ? `${dp >= 0 ? "+" : ""}${price(dp)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : null].filter(Boolean).join(" · ");
        label(txt, withX ? (x1 + x2) / 2 : a.x, withY ? y1 - 12 : 16, "center", color);
        break;
      }
      case "fibext": {
        ctx.setLineDash([4, 4]);
        line(a.x, a.y, b.x, b.y);
        if (c) line(b.x, b.y, c.x, c.y);
        ctx.setLineDash([]);
        if (!c) break;
        const mv = b.price - a.price;
        for (const r of [0, 0.618, 1, 1.618, 2.618]) {
          const pv = c.price + mv * r,
            yy = this.y(pv);
          if (yy == null) continue;
          line(c.x, yy, size.width, yy);
          label(`${r} (${price(pv)})`, size.width - 4, yy - 10, "right");
        }
        break;
      }
      case "brush":
      case "xabcd": {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        if (d.type === "xabcd") {
          ctx.setLineDash([4, 4]);
          for (const [i, j] of [[0, 2], [1, 3], [2, 4]]) if (pts[j]) line(pts[i].x, pts[i].y, pts[j].x, pts[j].y);
          ctx.setLineDash([]);
          pts.forEach((p, i) => label("XABCD"[i], p.x, p.y - 10, "center", color));
        }
        break;
      }
      case "ray": {
        const [p, q] = extend(a, b, false);
        line(p.x, p.y, q.x, q.y);
        break;
      }
      case "extended": {
        const [p, q] = extend(a, b, true);
        line(p.x, p.y, q.x, q.y);
        break;
      }
      case "hline":
        line(0, a.y, size.width, a.y);
        label(price(a.price), size.width - 4, a.y - 10, "right");
        break;
      case "hray":
        line(a.x, a.y, size.width, a.y);
        label(price(a.price), size.width - 4, a.y - 10, "right");
        break;
      case "vline":
        line(a.x, 0, a.x, size.height);
        break;
      case "channel": {
        line(a.x, a.y, b.x, b.y);
        if (c) {
          const off =
            c.y - (a.y + ((b.y - a.y) * (c.x - a.x)) / (b.x - a.x || 1));
          line(a.x, a.y + off, b.x, b.y + off);
          ctx.globalAlpha = 0.08;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(b.x, b.y + off);
          ctx.lineTo(a.x, a.y + off);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      }
      case "zoom":
      case "rect": {
        ctx.globalAlpha = 0.12;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.globalAlpha = 1;
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        break;
      }
      case "fib": {
        const x1 = Math.min(a.x, b.x),
          x2 = Math.max(a.x, b.x);
        ctx.strokeStyle = d.color || COLORS.fib;
        for (const lv of FIB_LEVELS) {
          const p = b.price + (a.price - b.price) * lv;
          const y = this.y(p);
          if (y == null) continue;
          ctx.globalAlpha = lv === 0.5 || lv === 0.618 ? 1 : 0.7;
          line(x1, y, x2, y);
          ctx.globalAlpha = 1;
          ctx.fillStyle = d.color || COLORS.fib;
          label(`${lv} (${price(p)})`, x1 + 2, y - 8);
        }
        ctx.setLineDash([3, 3]);
        line(a.x, a.y, b.x, b.y);
        ctx.setLineDash([]);
        break;
      }
      case "measure": {
        const up = b.price >= a.price;
        ctx.fillStyle = (up ? COLORS.up : COLORS.down) + "0.15)";
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeStyle = (up ? COLORS.up : COLORS.down) + "1)";
        line((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y);
        const bars = Math.round(
          this.pane.logicalOf(b.time) - this.pane.logicalOf(a.time),
        );
        const diff = b.price - a.price,
          pct = (diff / a.price) * 100;
        ctx.fillStyle = (up ? COLORS.up : COLORS.down) + "1)";
        label(
          `${diff >= 0 ? "+" : ""}${price(diff)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)  ${bars} bars`,
          (a.x + b.x) / 2,
          b.y + (up ? -14 : 14),
          "center",
          (up ? COLORS.up : COLORS.down) + "0.9)",
        );
        break;
      }
      case "long":
      case "short": {
        // first point = entry, second point sets the stop (its price) and the width (its time); target = 2R
        const dir = d.type === "long" ? 1 : -1;
        const risk = Math.abs(a.price - b.price) || a.price * 0.01;
        const stop = a.price - dir * risk,
          target = a.price + dir * risk * (d.rr || 2);
        const ys = this.y(stop),
          yt = this.y(target);
        const x1 = Math.min(a.x, b.x),
          w = Math.max(Math.abs(b.x - a.x), 40);
        ctx.fillStyle = COLORS.up + "0.18)";
        ctx.fillRect(x1, a.y, w, yt - a.y);
        ctx.fillStyle = COLORS.down + "0.18)";
        ctx.fillRect(x1, a.y, w, ys - a.y);
        ctx.strokeStyle = "#787b86";
        line(x1, a.y, x1 + w, a.y);
        ctx.fillStyle = COLORS.up + "1)";
        label(
          `Target ${price(target)} (${(((target - a.price) / a.price) * 100 * dir).toFixed(2)}%)`,
          x1 + w / 2,
          yt + (dir > 0 ? 10 : -10),
          "center",
          COLORS.up + "0.9)",
        );
        label(
          `Stop ${price(stop)} (${(((a.price - stop) / a.price) * 100 * dir).toFixed(2)}%)`,
          x1 + w / 2,
          ys + (dir > 0 ? -10 : 10),
          "center",
          COLORS.down + "0.9)",
        );
        ctx.fillStyle = "#787b86";
        label(
          `Entry ${price(a.price)}  R:R ${(d.rr || 2).toFixed(1)}`,
          x1 + 4,
          a.y - 9,
        );
        break;
      }
      case "text": {
        ctx.font = "13px Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif";
        label(d.text || "Note", a.x, a.y, "left", d.color || COLORS.line);
        break;
      }
      default:
        if (EMOJI_CHAR[d.type]) {
          ctx.save();
          ctx.font = "24px \"Segoe UI Emoji\", \"Apple Color Emoji\", sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(EMOJI_CHAR[d.type], a.x, a.y);
          ctx.restore();
        }
        break;
    }
    if (active && d.type !== "brush" && d.type !== "highlighter" && d.fx === undefined) {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // Nearest drawing within a few pixels of (x, y), for selecting.
  hitTest(x, y) {
    if (this.pane.app?.hideDrawings || this.pane.app?.lockDrawings) return null;
    let best = null,
      bestD = 7;
    const segDist = (p, q) => {
      const dx = q.x - p.x,
        dy = q.y - p.y,
        l2 = dx * dx + dy * dy;
      const t = l2
        ? Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / l2))
        : 0;
      return Math.hypot(x - (p.x + t * dx), y - (p.y + t * dy));
    };
    for (const d of this.items) {
      const pts = d.points.map((p) => ({
        x: this.x(p.time),
        y: this.y(p.price),
      }));
      if (pts.some((p) => p.x == null || p.y == null)) continue;
      const [a, b] = pts;
      let dist = Infinity;
      if (d.fx !== undefined) {
        const W = this.pane.chart.timeScale().width(),
          H = this.pane.chart.panes()[0].getHeight();
        const ax = d.fx * W,
          ay = d.fy * H;
        dist = x >= ax - 4 && x <= ax + 140 && Math.abs(y - ay) < 12 ? 0 : Infinity;
      } else if (d.type === "hline") dist = Math.abs(y - a.y);
      else if (d.type === "hray")
        dist = x >= a.x - 4 ? Math.abs(y - a.y) : Infinity;
      else if (d.type === "vline") dist = Math.abs(x - a.x);
      else if (["brush", "highlighter", "xabcd", "abcd", "polyline", "headshoulders", "path", ...Object.keys(WAVES)].includes(d.type))
        dist = Math.min(Infinity, ...pts.slice(1).map((q, i) => segDist(pts[i], q)));
      else if (d.type === "cyclic" || d.type === "timecycles") {
        const w = Math.abs(b.x - a.x) || 1;
        const r = (((x - a.x) % w) + w) % w;
        dist = d.type === "cyclic" ? Math.min(r, w - r) : Math.abs(y - a.y) < w / 3 ? 3 : Infinity;
      } else if (d.type === "signpost") dist = Math.abs(x - a.x) < 10 && y >= a.y - 40 && y <= a.y + 4 ? 0 : Infinity;
      else if (d.type === "pricenote") dist = x >= a.x - 4 && x <= a.x + 80 && y >= a.y - 24 && y <= a.y + 4 ? 0 : Infinity;
      else if (d.type === "crossline") dist = Math.min(Math.abs(y - a.y), Math.abs(x - a.x));
      else if (d.type === "circle" || d.type === "ellipse") {
        const circ = d.type === "circle";
        const rx = Math.max(1, circ ? Math.hypot(b.x - a.x, b.y - a.y) : Math.abs(b.x - a.x) / 2);
        const ry = Math.max(1, circ ? rx : Math.abs(b.y - a.y) / 2);
        const cx = circ ? a.x : (a.x + b.x) / 2,
          cy = circ ? a.y : (a.y + b.y) / 2;
        dist = Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
      } else if (d.type === "triangle") dist = Math.min(Infinity, ...pts.map((q, i) => segDist(q, pts[(i + 1) % pts.length])));
      else if (EMOJI_CHAR[d.type]) dist = Math.abs(x - a.x) < 14 && Math.abs(y - a.y) < 14 ? 0 : Infinity;
      else if (d.type === "arrowleft" || d.type === "arrowright") dist = Math.abs(y - a.y) < 10 && Math.abs(x - a.x) < 30 ? 0 : Infinity;
      else if (["arrowup", "arrowdown", "flag"].includes(d.type))
        dist = Math.abs(x - a.x) < 12 && y >= a.y - 30 && y <= a.y + 30 ? 0 : Infinity;
      else if (d.type === "daterange") dist = x >= Math.min(a.x, b.x) - 4 && x <= Math.max(a.x, b.x) + 4 ? 3 : Infinity;
      else if (d.type === "pricerange") dist = y >= Math.min(a.y, b.y) - 4 && y <= Math.max(a.y, b.y) + 4 ? 3 : Infinity;
      else if (d.type === "text" || d.type === "note" || d.type === "pricelabel")
        dist =
          x >= a.x - 4 && x <= a.x + 120 && Math.abs(y - a.y) < 12
            ? 0
            : Infinity;
      else if (["rect", "fib", "fibext", "measure", "long", "short", "daterangeprice", "flat", "rotated", "pitchfork", "schiff", "mschiff", "pitchfan", "fibchannel", "fibtimezone", "trendfibtime", "fibcircles", "fibspiral", "fibarcs", "fibwedge", "fibfan", "gannbox", "gannsquare", "gannfan", "trianglepattern", "sine", "balloon", "curve", "doublecurve", "arc", "projection", "fixedvp", "barspattern", "disjoint", "insidepitchfork", "gannsquarefixed"].includes(d.type)) {
        const xs = pts.map((p) => p.x),
          ys = pts.map((p) => p.y);
        const inside =
          x >= Math.min(...xs) - 4 &&
          x <= Math.max(...xs, a.x + 40) + 4 &&
          y >= Math.min(...ys) - 40 &&
          y <= Math.max(...ys) + 40;
        dist = inside ? 3 : Infinity;
      } else if (b) {
        const far = (p, q, both) => {
          const dx = q.x - p.x,
            dy = q.y - p.y,
            len = Math.hypot(dx, dy) || 1;
          return [
            both ? { x: p.x - (dx / len) * 1e5, y: p.y - (dy / len) * 1e5 } : p,
            { x: p.x + (dx / len) * 1e5, y: p.y + (dy / len) * 1e5 },
          ];
        };
        const [p, q] =
          d.type === "ray"
            ? far(a, b, false)
            : d.type === "extended"
              ? far(a, b, true)
              : [a, b];
        dist = segDist(p, q);
      }
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }
}
