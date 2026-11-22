// Draws the "All Chart Patterns" indicator on the price pane: each pattern's price line and neck or trend lines, a label
// with its name and status, and the price target as a dashed line from the breakout. Everything is placed by bar index
// (the pane's shown bars) and price, so it follows zoom and scroll.
//
// Readability: every label sits on its own solid pill so it never blends into candles of the same colour, the price
// line has a dark halo, colours are picked per theme for contrast, and labels are nudged apart so none covers another.
//
// Interaction: `hit(x, y)` says which pattern a click landed on (its label, or within a few pixels of its lines), from
// the geometry of the last draw. The pane uses that to select one: the selected pattern is drawn heavier and the rest
// fade back. `hidden` is a set of pattern keys that are not drawn at all.
const PALETTE = {
  dark: { up: "#19e39a", down: "#ff5f73", neutral: "#62b0ff", forming: "#ffb62e", failed: "#aeb3c2", pill: "rgba(11,13,19,0.92)", halo: "rgba(11,13,19,0.85)" },
  light: { up: "#007a52", down: "#c8102e", neutral: "#1555c8", forming: "#a85d00", failed: "#5d6270", pill: "rgba(255,255,255,0.94)", halo: "rgba(255,255,255,0.9)" },
};
const FONT = "600 12px -apple-system, Segoe UI, Roboto, sans-serif";
const PAD_X = 6, PILL_H = 18, HIT_PX = 7;

export function patternColour(p, theme = "dark") {
  const pal = PALETTE[theme === "light" ? "light" : "dark"];
  if (p.inProgress) return pal.forming;
  if (p.status === "Failed") return pal.failed;
  return p.dir === "bull" ? pal.up : p.dir === "bear" ? pal.down : pal.neutral;
}

// distance from point (px, py) to the segment a-b
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export class ChartPatterns {
  constructor(pane, patterns = []) {
    this.pane = pane;
    this.patterns = patterns; // each carries a `key`
    this.selected = null; // a key
    this.hidden = new Set(); // keys
    this.geom = []; // [{ key, segs: [[x1, y1, x2, y2]], pills: [{ x, y, w }] }] from the last draw
    this._view = {
      zOrder: () => "top",
      renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => this.draw(context, mediaSize)) }),
    };
  }

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

  // The key of the pattern at (x, y), or null. A label counts first, then the nearest line within a few pixels.
  hit(x, y) {
    for (const g of [...this.geom].reverse()) if (g.pills.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + PILL_H)) return g.key;
    let best = null, bestD = HIT_PX;
    for (const g of this.geom)
      for (const [ax, ay, bx, by] of g.segs) {
        const d = distToSegment(x, y, ax, ay, bx, by);
        if (d <= bestD) { best = g.key; bestD = d; }
      }
    return best;
  }

  // A label pill whose left edge is near x and whose vertical centre is near y. It is moved up or down in steps until it
  // overlaps no earlier label, and kept inside the pane. Returns its rectangle; `taken` remembers where it went.
  label(ctx, text, x, y, colour, pal, taken, size) {
    const w = Math.ceil(ctx.measureText(text).width) + 2 * PAD_X;
    const left = Math.max(2, Math.min(size.width - w - 2, x));
    let top = y - PILL_H / 2;
    const clash = (t) => taken.some((r) => left < r.x + r.w && left + w > r.x && t < r.y + PILL_H && t + PILL_H > r.y);
    for (let k = 0; k < 14 && clash(top); k++) top += (k % 2 ? 1 : -1) * (PILL_H + 2) * (1 + (k >> 1));
    top = Math.max(2, Math.min(size.height - PILL_H - 2, top));
    const rect = { x: left, y: top, w };
    taken.push(rect);
    ctx.fillStyle = pal.pill;
    ctx.beginPath();
    ctx.roundRect(left, top, w, PILL_H, 5);
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + PAD_X, top + PILL_H / 2 + 0.5);
    return rect;
  }

  draw(ctx, size) {
    const ts = this.pane.chart.timeScale(), series = this.series;
    if (!series) return;
    const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const pal = PALETTE[theme];
    const xy = (a) => {
      const x = ts.logicalToCoordinate(a.i), y = series.priceToCoordinate(a.price);
      return x == null || y == null ? null : { x, y };
    };
    const taken = [];
    this.geom = [];
    ctx.save();
    ctx.font = FONT;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const anySelected = this.selected != null && this.patterns.some((p) => p.key === this.selected && !this.hidden.has(p.key));
    // a selected pattern is drawn last, so its label wins the nearest spot and nothing covers its line
    const order = [...this.patterns].sort((a, b) => (a.key === this.selected) - (b.key === this.selected));
    for (const p of order) {
      if (this.hidden.has(p.key)) continue;
      const col = patternColour(p, theme);
      const pts = p.points.map(xy);
      if (pts.some((q) => !q)) continue; // off the visible price range or time range
      if (pts.every((q) => q.x < -50 || q.x > size.width + 50)) continue;
      const isSel = p.key === this.selected, g = { key: p.key, segs: [], pills: [] };
      ctx.globalAlpha = anySelected && !isSel ? 0.28 : 1;
      const trace = () => {
        ctx.beginPath();
        pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      };
      ctx.setLineDash([]);
      ctx.strokeStyle = pal.halo; // a dark edge under the line, so it reads against candles of any colour
      ctx.lineWidth = isSel ? 8 : 5;
      trace();
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = isSel ? 3.5 : 2.5;
      ctx.setLineDash(p.inProgress ? [6, 4] : []);
      trace();
      ctx.stroke();
      for (let k = 1; k < pts.length; k++) g.segs.push([pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y]);
      if (isSel) {
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        for (const q of pts) { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = isSel ? 2.2 : 1.6;
      for (const l of p.lines) {
        const a = xy(l.a), b = xy(l.b);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        g.segs.push([a.x, a.y, b.x, b.y]);
      }
      ctx.setLineDash([]);
      // the label sits clear of the figure: above a top-heavy one, below a bottom-heavy one
      const top = pts.reduce((m, q) => (q.y < m.y ? q : m), pts[0]), low = pts.reduce((m, q) => (q.y > m.y ? q : m), pts[0]);
      const above = p.dir === "bear" || p.dir === "either";
      g.pills.push(this.label(ctx, `${p.type} · ${p.status}`, top.x - 24, above ? top.y - 18 : low.y + 18, col, pal, taken, size));
      if (p.target && p.breakI != null) {
        const a = xy({ i: p.target.fromI, price: p.target.price }), b = xy({ i: p.target.toI, price: p.target.price });
        if (a && b) {
          ctx.strokeStyle = col;
          ctx.lineWidth = isSel ? 2.4 : 1.6;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(b.x, b.y, p.status === "Reached" ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
          g.segs.push([a.x, a.y, b.x, b.y]);
          g.pills.push(this.label(ctx, `Target ${p.target.price.toFixed(2)}`, b.x + 8, b.y, col, pal, taken, size));
        }
      }
      if (isSel) {
        // the stop and the entry as thin full-width guides, so the risk is visible against the candles
        for (const [price, text, dash] of [[p.stop, "Stop", [6, 4]], [p.entry, "Entry", [2, 3]]]) {
          if (price == null) continue;
          const y = series.priceToCoordinate(price);
          if (y == null) continue;
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.setLineDash(dash);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(size.width, y);
          ctx.stroke();
          ctx.setLineDash([]);
          g.pills.push(this.label(ctx, `${text} ${price.toFixed(2)}`, size.width - 120, y, col, pal, taken, size));
        }
      }
      this.geom.push(g);
    }
    ctx.restore();
  }
}
