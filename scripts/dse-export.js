#!/usr/bin/env node
// Option 1: copy DSE bars from your day-end files into the terminal's own imports, so they chart as
// CSV:DSE_<TICKER> with no code involved. (DSE:<TICKER> reads the same files live, with no copy.)
//   node scripts/dse-export.js                       DSEX, DS30, AL-HAJTEX, CROWNCEMNT
//   node scripts/dse-export.js --tickers GP,BRACBANK
//   node scripts/dse-export.js --all                 every share in the files
import * as dse from '../lib/dse.js';
import { importBars } from '../lib/imports.js';

const a = process.argv.slice(2);
const pick = (flag) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : null; };
const list = a.includes('--all') ? dse.tickers()
  : pick('--tickers') ? pick('--tickers').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  : ['DSEX', 'DS30', 'AL-HAJTEX', 'CROWNCEMNT'];

let ok = 0;
for (const t of list) {
  try {
    const s = importBars(`DSE_${t}`, dse.csvOf(t));
    console.log(`${s.symbol}  ${s.bars} bars  ${s.from} to ${s.to}`);
    ok++;
  } catch (e) { console.log(`Skipped ${t}: ${e.message}`); }
}
console.log(`\n${ok} of ${list.length} imported into data/imports. Chart them as CSV:DSE_<TICKER> (dashes become underscores).`);
