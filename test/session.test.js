import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSessionOpen, pollDelayMs } from '../public/lib/session.js';

// Dhaka is UTC+6: 10:00 there is 04:00 UTC. 8 Nov 2026 is a Sunday.
const at = (day, hh, mm = 0) => Date.UTC(2026, 10, day, hh - 6, mm);

test('the session is Sunday to Thursday, 10:00 to 14:30 Dhaka time', () => {
  assert.equal(isSessionOpen(at(8, 9, 59)), false);
  assert.equal(isSessionOpen(at(8, 10, 0)), true);
  assert.equal(isSessionOpen(at(8, 14, 29)), true);
  assert.equal(isSessionOpen(at(8, 14, 30)), false);
  assert.equal(isSessionOpen(at(12, 11, 0)), true, 'Thursday');
  assert.equal(isSessionOpen(at(13, 11, 0)), false, 'Friday');
  assert.equal(isSessionOpen(at(14, 11, 0)), false, 'Saturday');
});

test('Dhaka time, not the viewer\'s: 04:00 UTC is 10:00 in Dhaka', () => {
  assert.equal(isSessionOpen(Date.UTC(2026, 10, 8, 4, 0)), true);
  assert.equal(isSessionOpen(Date.UTC(2026, 10, 8, 3, 59)), false);
  // late Thursday UTC is already Friday in Dhaka after 18:00 UTC
  assert.equal(isSessionOpen(Date.UTC(2026, 10, 12, 20, 0)), false);
});

test('a chart asks every 10 s on daily bars, 30 s on hourly, and once a minute when closed', () => {
  assert.equal(pollDelayMs(at(8, 11), false), 10000);
  assert.equal(pollDelayMs(at(8, 11), true), 30000);
  assert.equal(pollDelayMs(at(8, 16), false), 60000);
  assert.equal(pollDelayMs(at(13, 11), true), 60000);
});
