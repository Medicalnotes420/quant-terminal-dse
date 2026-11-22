// Pattern detections for DSE shares, read from the Stockapp chart service (python -m uvicorn chartapp.api:app).
// Read-only. Only the date, direction and name travel on: the service's prices are adjusted for corporate
// actions and the terminal's bars are not, so drawing them together would float off the candles.
const BASE = (process.env.QT_PATTERNS_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

// "DSE:AL-HAJTEX" and "CSV:DSE_AL-HAJTEX" are shares; anything else has no detections.
export const shareOf = (symbol) => /^(?:DSE:|CSV:DSE_)(.+)$/i.exec(String(symbol || ""))?.[1].toUpperCase() || null;

export async function detections(symbol, fetchFn = fetch) {
  const t = shareOf(symbol);
  if (!t) return { ticker: null, signals: [] };
  let r;
  try {
    // the first call per ticker walks the full history, so allow it time
    r = await fetchFn(`${BASE}/api/detections/${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(30000) });
  } catch {
    return { ticker: t, down: true, signals: [], error: `Pattern service isn't running at ${BASE}. Start it from the Stockapp folder: python -m uvicorn chartapp.api:app --port 8000` };
  }
  if (r.status === 404) return { ticker: t, signals: [] }; // an index, or a share the service doesn't hold
  if (!r.ok) return { ticker: t, down: true, signals: [], error: `Pattern service answered ${r.status}.` };
  const all = await r.json();
  return {
    ticker: t,
    signals: all.map((s) => ({ pattern: s.pattern, date: s.signal_date, direction: s.direction, note: s.note || "" })),
  };
}
