import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A fresh process with the gate on, offline, so a leak to another market would be a failure, not a request.
const run = (code) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
  env: { ...process.env, QT_DSE_ONLY: '1', QT_OFFLINE: '1' }, encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)),
}));

test('with the gate on, other markets are refused and never reach a provider', () => {
  const out = run(`
    const d = await import('./lib/providers.js');
    const no = async (s) => d.resolve(s).then(() => 'resolved', (e) => e.message);
    console.log(JSON.stringify({
      btc: await no('BTCUSDT'), aapl: await no('US:AAPL'), fx: await no('EURUSD'), fut: await no('NQ1!'),
      csv: (await d.resolve('CSV:MYFILE')).exchange, dse: (await d.resolve('DSE:DSEX')).id,
      probe: Object.keys(await d.probeAll()), only: d.DSE_ONLY,
      search: (await d.search('BTC')).filter((r) => r.exchange !== 'CSV' && r.exchange !== 'DSE').length,
    }));`);
  assert.equal(out.only, true);
  for (const k of ['btc', 'aapl', 'fx', 'fut']) assert.match(out[k], /Only DSE/);
  assert.equal(out.csv, 'CSV');
  assert.equal(out.dse, 'DSE:DSEX');
  assert.deepEqual(out.probe, ['DSE files']);
  assert.equal(out.search, 0);
});
