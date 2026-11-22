import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-fund-'));
process.env.QT_FUND_DIR = dir;
const rec = (code, category, extra = {}) => ({ code, name: `${code} Ltd`, sector: 'Textile', category, board: 'PUBLIC', paidUpCapital: 1000, faceValue: 10, authorizedCapital: '$undefined',
  multiYearFinancials: [{ year: 2025, epsBasic: -1.64, nav: 16.38 }, { year: 2023, epsBasic: 0.5, nav: 9 }, { year: 2024, epsBasic: '$undefined', nav: 12 }],
  dividendHistory: [{ year: 2025, cash: 3, stock: 0, yieldPct: '$undefined' }], news: [{ date: '1 Nov 2026', type: 'Dividend', summary: 'S', body: 'x'.repeat(900) }], ...extra });
fs.writeFileSync(path.join(dir, 'snapshot_2026-11-05.json.gz'), zlib.gzipSync(JSON.stringify({ day: '2026-11-05', records: { AAA: rec('AAA', 'A') } })));
fs.writeFileSync(path.join(dir, 'snapshot_2026-11-06.json.gz'), zlib.gzipSync(JSON.stringify({ day: '2026-11-06', records: { AAA: rec('AAA', 'A'), ZZZ: rec('ZZZ', 'Z') } })));
const f = await import('../lib/fundamentals.js');

test('the newest snapshot is read and "$undefined" becomes null', () => {
  const d = f.load();
  assert.equal(d.day, '2026-11-06');
  assert.equal(d.records.AAA.authorizedCapital, null);
  assert.equal(d.records.AAA.dividendHistory[0].yieldPct, null);
});

test('category Z settles in T+3 and the others in T+2', () => {
  assert.equal(f.settlement('Z'), 'T+3');
  assert.equal(f.settlement('A'), 'T+2');
  assert.equal(f.settlement(null), null);
});

test('company() trims the record, sorts the EPS years and cuts long news', () => {
  const c = f.company('zzz');
  assert.equal(c.settlement, 'T+3');
  assert.equal(c.shares, 100);
  assert.deepEqual(c.epsHistory.map((y) => y.year), [2023, 2024, 2025]);
  assert.deepEqual(c.eps, { year: 2025, eps: -1.64, nav: 16.38 });
  assert.equal(c.news[0].body.length, 500);
  assert.equal(f.company('DSEX'), null);
});

test('meta() maps each code to its name, sector and category', () => {
  assert.deepEqual(f.meta().AAA, { name: 'AAA Ltd', sector: 'Textile', category: 'A' });
});
