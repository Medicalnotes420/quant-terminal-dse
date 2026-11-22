// The Dhaka Stock Exchange's regular session: Sunday to Thursday, 10:00 to 14:30 Dhaka time (UTC+6).
// Public holidays are not known here: on one, the chart just asks and finds nothing new.
const OPEN = 10 * 60, CLOSE = 14 * 60 + 30;

const dhaka = (ms) => new Date(ms + 6 * 3600e3); // read it with the getUTC* methods

export function isSessionOpen(ms) {
  const d = dhaka(ms), dow = d.getUTCDay(); // 0 Sunday ... 4 Thursday, 5 Friday, 6 Saturday
  if (dow === 5 || dow === 6) return false;
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m >= OPEN && m < CLOSE;
}

// How often a live chart asks again: 10 s for daily bars, 30 s for hourly ones (StockNow's hourly bars are cached for
// a minute upstream), and once a minute while the exchange is closed, just to notice that it has opened.
export function pollDelayMs(ms, intraday) {
  return isSessionOpen(ms) ? (intraday ? 30000 : 10000) : 60000;
}
