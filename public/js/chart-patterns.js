// Draws the "All Chart Patterns" indicator on the price pane: each pattern's price line and neck or trend lines, a label
// with its name and status, and the price target as a dashed line from the breakout. Everything is placed by bar index
// (the pane's shown bars) and price, so it follows zoom and scroll.
const UP = "#089981", DOWN = "#f23645", NEUTRAL = "#2962ff", GREY = "#787b86", FORMING = "#ff9800";

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

  colour(p) {
    if (p.inProgress) return FORMING;
    if (p.status === "Failed") return GREY;
    return p.dir === "bull" ? UP : p.dir === "bear" ? DOWN : NEUTRAL;
  }

  draw(ctx, size) {
    const ts = this.pane.chart.timeScale(), series = this.series;
    if (!series) return;
    const xy = (a) => {
      const x = ts.logicalToCoordinate(a.i), y = series.priceToCoordinate(a.price);
      return x == null || y == null ? null : { x, y };
    };
    ctx.font = "11px -apple-system, Segoe UI, Roboto, sans-serif";
    for (const p of this.patterns) {
      const col = this.colour(p);
      const pts = p.points.map(xy);
      if (pts.some((q) => !q)) continue; // off the visible price range or time range
      const clip = pts.every((q) => q.x < -50 || q.x > size.width + 50);
      if (clip) continue;
      ctx.lineJoin = "round";
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.setLineDash(p.inProgress ? [5, 4] : []);
      ctx.beginPath();
      pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const l of p.lines) {
        const a = xy(l.a), b = xy(l.b);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // label by the pattern's extreme: above a top-heavy pattern, below a bottom-heavy one
      const top = pts.reduce((m, q) => (q.y < m.y ? q : m), pts[0]), low = pts.reduce((m, q) => (q.y > m.y ? q : m), pts[0]);
      const above = p.dir === "bear" || p.dir === "either";
      const text = `${p.type} · ${p.status}`;
      ctx.fillStyle = col;
      ctx.textAlign = "left";
      ctx.fillText(text, Math.max(2, Math.min(size.width - ctx.measureText(text).width - 2, top.x - 20)), above ? top.y - 8 : low.y + 16);
      if (p.target && p.breakI != null) {
        const a = xy({ i: p.target.fromI, price: p.target.price }), b = xy({ i: p.target.toI, price: p.target.price });
        if (a && b) {
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.textAlign = "left";
          ctx.fillText(`Target ${p.target.price.toFixed(2)}`, b.x + 4, b.y + 4);
          ctx.beginPath();
          ctx.arc(b.x, b.y, p.status === "Reached" ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}
