const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { WEEK_PRIZES, lagosWeekStart, weekWindows } = require('../src/leaderboard');

describe('leaderboard weeks (Africa/Lagos, Mon 00:00:01 – Sun 23:59:59)', () => {
  it('a Tuesday sits in the week that started Monday', () => {
    // Tue 22 Sep 2026 12:00 UTC = 13:00 Lagos
    const start = lagosWeekStart(new Date(Date.UTC(2026, 8, 22, 12, 0)));
    assert.equal(start.toISOString(), '2026-09-20T23:00:01.000Z'); // Mon 00:00:01 Lagos
  });

  it('Sunday evening is still the same week', () => {
    const start = lagosWeekStart(new Date(Date.UTC(2026, 8, 27, 20, 0)));
    assert.equal(start.toISOString(), '2026-09-20T23:00:01.000Z');
  });

  it('Monday just after midnight starts a new week', () => {
    const start = lagosWeekStart(new Date(Date.UTC(2026, 8, 27, 23, 30)));
    assert.equal(start.toISOString(), '2026-09-27T23:00:01.000Z'); // Mon 28th 00:00:01 Lagos
  });

  it('week windows span exactly Mon 00:00:01 – Sun 23:59:59', () => {
    const w = weekWindows(new Date(Date.UTC(2026, 8, 22, 12, 0)));
    assert.equal(w.end.toISOString(), '2026-09-27T22:59:59.000Z');
    assert.equal(w.prevEnd.toISOString(), '2026-09-20T22:59:59.000Z');
    assert.equal(w.prevStart.toISOString(), '2026-09-13T23:00:01.000Z');
    assert.equal(w.end.getTime() - w.start.getTime(), 7 * 86400 * 1000 - 2000);
  });

  it('weekly prizes are 5000 / 3000 / 2000', () => {
    assert.deepEqual(WEEK_PRIZES, [5000, 3000, 2000]);
  });
});
