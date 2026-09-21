const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const custom = require('../src/custom');

describe('custom draw ids', () => {
  it('formats G<id>-<UTC window>', () => {
    // 5 Oct 2026 18:00 UTC
    assert.equal(custom.customDrawId(7, new Date(Date.UTC(2026, 9, 5, 18, 0))), 'G7-202610051800');
  });

  it('one-off id is stable per giveaway', () => {
    assert.equal(custom.oneOffDrawId(3), 'G3-ONCE');
  });
});

describe('interval windows', () => {
  // ₦100 every 5 min for 3h: 12:00–15:00 UTC
  const g = {
    id: 1,
    interval_minutes: 5,
    starts_at: new Date(Date.UTC(2026, 9, 5, 12, 0)).toISOString(),
    ends_at: new Date(Date.UTC(2026, 9, 5, 15, 0)).toISOString(),
  };

  it('finds the current window', () => {
    const w = custom.currentWindow(g, new Date(Date.UTC(2026, 9, 5, 12, 7)));
    assert.equal(w.index, 1);
    assert.equal(w.start.toISOString(), new Date(Date.UTC(2026, 9, 5, 12, 5)).toISOString());
    assert.equal(w.end.toISOString(), new Date(Date.UTC(2026, 9, 5, 12, 10)).toISOString());
    assert.equal(custom.customDrawId(1, w.start), 'G1-202610051205');
  });

  it('returns null outside the run', () => {
    assert.equal(custom.currentWindow(g, new Date(Date.UTC(2026, 9, 5, 11, 59))), null);
    assert.equal(custom.currentWindow(g, new Date(Date.UTC(2026, 9, 5, 15, 0))), null);
  });

  it('counts 36 windows for 3h at 5-minute intervals', () => {
    assert.equal(custom.windowCount(g), 36);
  });

  it('counts 10 windows for 10 minutes at 1-minute intervals', () => {
    const h = {
      interval_minutes: 1,
      starts_at: new Date(Date.UTC(2026, 9, 5, 12, 0)).toISOString(),
      ends_at: new Date(Date.UTC(2026, 9, 5, 12, 10)).toISOString(),
    };
    assert.equal(custom.windowCount(h), 10);
  });
});

describe('one-off due checks', () => {
  const g = { id: 2, scheduled_at: new Date(Date.UTC(2026, 9, 5, 18, 0)).toISOString() };

  it('upcoming before the scheduled time', () => {
    assert.equal(custom.oneOffState(g, new Date(Date.UTC(2026, 9, 5, 17, 59))), 'upcoming');
  });

  it('due at and after the scheduled time', () => {
    assert.equal(custom.oneOffState(g, new Date(Date.UTC(2026, 9, 5, 18, 0))), 'due');
    assert.equal(custom.oneOffState(g, new Date(Date.UTC(2026, 9, 5, 20, 0))), 'due');
  });
});

describe('classification', () => {
  it('interval vs one-off vs misconfigured', () => {
    assert.equal(custom.isIntervalGiveaway({ interval_minutes: 5 }), true);
    assert.equal(custom.isIntervalGiveaway({ interval_minutes: null }), false);
    assert.equal(custom.isOneOffGiveaway({ scheduled_at: '2026-10-05T18:00:00Z' }), true);
    assert.equal(custom.isOneOffGiveaway({ interval_minutes: 5, scheduled_at: 'x' }), false);
    assert.equal(custom.oneOffState({ interval_minutes: 5 }, new Date()), null);
  });
});
