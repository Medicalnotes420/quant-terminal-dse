// Draws the "All Chart Patterns" indicator on the price pane: each pattern's price line and neck or trend lines, a label
// with its name and status, and the price target as a dashed line from the breakout. Everything is placed by bar index
// (the pane's shown bars) and price, so it follows zoom and scroll.
//
// Readability: every label sits on its own solid pill so it never blends into candles of the same colour, the price
// line has a dark halo, colours are picked per theme for contrast, and labels are nudged apart so none covers another.
const PALETTE = {
  dark: { up: "#19e39a", down: "#ff5f73", neutral: "#62b0ff", forming: "#ffb62e", failed: "#aeb3c2", pill: "rgba(11,13,19,0.92)", halo: "rgba(11,13,19,0.85)" },
  light: { up: "#007a52", down: "#c8102e", neutral: "#1555c8", forming: "#a85d00", failed: "#5d6270", pill: "rgba(255,255,255,0.94)", halo: "rgba(255,255,255,0.9)" },
};
const FONT = "600 12px -apple-system, Segoe UI, Roboto, sans-serif";
const PAD_X = 6, PILL_H = 18;

export class ChartPatterns {
  constructor(pane, patterns = []) {
    this.pane = pane;
    this.patterns = patterns;
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

  colour(p, pal) {
    if (p.inProgress) return pal.forming;
    if (p.status === "Failed") return pal.failed;
    return p.dir === "bull" ? pal.up : p.dir === "bear" ? pal.down : pal.neutral;
  }

  // A label pill whose left edge is near x and whose vertical centre is near y. It is moved up or down in steps until it
  // overlaps no earlier label, and kept inside the pane. Returns nothing; `taken` remembers where it went.
  label(ctx, text, x, y, colour, pal, taken, size) {
    const w = Math.ceil(ctx.measureText(text).width) + 2 * PAD_X;
    const left = Math.max(2, Math.min(size.width - w - 2, x));
    let top = y - PILL_H / 2;
    const clash = (t) => taken.some((r) => left < r.x + r.w && left + w > r.x && t < r.y + PILL_H && t + PILL_H > r.y);
    for (let k = 0; k < 14 && clash(top); k++) top += (k % 2 ? 1 : -1) * (PILL_H + 2) * (1 + (k >> 1));
    top = Math.max(2, Math.min(size.height - PILL_H - 2, top));
    taken.push({ x: left, y: top, w });
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
  }

  draw(ctx, size) {
    const ts = this.pane.chart.timeScale(), series = this.series;
    if (!series) return;
    const pal = PALETTE[document.documentElement.dataset.theme === "light" ? "light" : "dark"];
    const xy = (a) => {
      const x = ts.logicalToCoordinate(a.i), y = series.priceToCoordinate(a.price);
      return x == null || y == null ? null : { x, y };
    };
    const taken = [];
    ctx.save();
    ctx.font = FONT;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // newest patterns last, so their labels win the nearest spot
    for (const p of this.patterns) {
      const col = this.colour(p, pal);
      const pts = p.points.map(xy);
      if (pts.some((q) => !q)) continue; // off the visible price range or time range
      if (pts.every((q) => q.x < -50 || q.x > size.width + 50)) continue;
      const trace = () => {
        ctx.beginPath();
        pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      };
      ctx.setLineDash([]);
      ctx.strokeStyle = pal.halo; // a dark edge under the line, so it reads against candles of any colour
      ctx.lineWidth = 5;
      trace();
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.setLineDash(p.inProgress ? [6, 4] : []);
      trace();
      ctx.stroke();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.6;
      for (const l of p.lines) {
        const a = xy(l.a), b = xy(l.b);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // the label sits clear of the figure: above a top-heavy one, below a bottom-heavy one
      const top = pts.reduce((m, q) => (q.y < m.y ? q : m), pts[0]), low = pts.reduce((m, q) => (q.y > m.y ? q : m), pts[0]);
      const above = p.dir === "bear" || p.dir === "either";
      this.label(ctx, `${p.type} · ${p.status}`, top.x - 24, above ? top.y - 18 : low.y + 18, col, pal, taken, size);
      if (p.target && p.breakI != null) {
        const a = xy({ i: p.target.fromI, price: p.target.price }), b = xy({ i: p.target.toI, price: p.target.price });
        if (a && b) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.6;
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
          this.label(ctx, `Target ${p.target.price.toFixed(2)}`, b.x + 8, b.y, col, pal, taken, size);
        }
      }
    }
    ctx.restore();
  }
}
