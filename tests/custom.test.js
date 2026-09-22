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

describe('OG (other-category) draws', () => {
  const p2 = (n) => String(n).padStart(2, '0');

  it('interval window: OG + 2-digit id + local DDMMYYYY + hour letter (12:33am -> A)', () => {
    const d = new Date(2026, 8, 21, 0, 33);
    const expected =
      'OG' + p2(9) + p2(d.getDate()) + p2(d.getMonth() + 1) + d.getFullYear() + String.fromCharCode(65 + d.getHours());
    assert.equal(custom.customDrawId({ id: 9, draw_prefix: 'OG' }, d), expected);
    assert.equal(expected, 'OG0921092026A');
  });

  it('legacy G<id> format still works when no prefix is set', () => {
    assert.equal(custom.customDrawId(7, new Date(Date.UTC(2026, 9, 5, 18, 0))), 'G7-202610051800');
    assert.equal(custom.oneOffDrawId(3), 'G3-ONCE');
  });

  it('one-off uses the giveaway creation time: #1 created 12:33am -> OG0121092026A', () => {
    const created = new Date(2026, 8, 21, 0, 33, 0);
    const g = {
      id: 1,
      draw_prefix: 'OG',
      created_at: created.toISOString(),
      scheduled_at: new Date(2026, 8, 30, 18, 0, 0).toISOString(),
    };
    assert.equal(custom.oneOffDrawId(g), 'OG0121092026A');
  });

  it('one-off prefers draw_seq over row id (row 6, seq 1 -> CASH01…) ', () => {
    const g = {
      id: 6,
      draw_prefix: 'CASH',
      draw_seq: 1,
      created_at: new Date(2026, 8, 22, 14, 30, 0).toISOString(),
      scheduled_at: new Date(2026, 9, 17, 21, 0, 0).toISOString(),
    };
    const id = custom.oneOffDrawId(g);
    assert.ok(id.startsWith('CASH01'), id);
  });
});

describe('entry-stamped tickets', () => {
  it('stamps entry date + hour (enter 23 Sep 00:30 -> CASH0123092026A)', () => {
    const g = { id: 6, draw_prefix: 'CASH', draw_seq: 1 };
    assert.equal(custom.ticketPrefixFor(g, new Date(2026, 8, 23, 0, 30)), 'CASH0123092026A');
  });

  it('uses draw_seq when set, row id otherwise', () => {
    const d = new Date(2026, 8, 21, 12, 0);
    assert.ok(custom.ticketPrefixFor({ id: 6, draw_prefix: 'CASH', draw_seq: 1 }, d).startsWith('CASH01'));
    assert.ok(custom.ticketPrefixFor({ id: 6, draw_prefix: 'CASH' }, d).startsWith('CASH06'));
  });

  it('entry stamp ignores the draw id: FD01 draw, enter 23 Sep 01:56 -> FD0123092026B', () => {
    // Draw FD0122092026A is days old; a ticket claimed 23 Sep at 01:56
    // must still stamp the ENTRY moment, not the draw id.
    const g = { id: 5, draw_prefix: 'FD', draw_seq: 1 };
    assert.equal(custom.ticketPrefixFor(g, new Date(2026, 8, 23, 1, 56)), 'FD0123092026B');
  });
});

describe('ticket labels', () => {
  it('hourly draws are CASH', () => {
    assert.deepEqual(custom.drawLabel({ id: '20092026A', kind: 'hourly_200' }, null), {
      chip: 'CASH',
      title: '₦200 Hourly',
    });
  });

  it('custom draws use category + name (netflix, gadget)', () => {
    assert.deepEqual(custom.drawLabel({ id: 'OG30092026S', kind: 'custom' }, { category: 'others', name: 'Netflix Account — 1 Month' }), {
      chip: 'OTHERS',
      title: 'Netflix Account — 1 Month',
    });
    assert.deepEqual(custom.drawLabel({ id: 'G2-xxx', kind: 'custom' }, { category: 'gadgets', name: 'iPhone 16' }), {
      chip: 'GADGETS',
      title: 'iPhone 16',
    });
  });
});

describe('prize labels', () => {
  it('prefers prize_text for non-cash prizes', () => {
    assert.equal(custom.prizeLabel({ amount: 0, prize_text: '1 Netflix Account' }), '1 Netflix Account');
    assert.equal(custom.prizeLabel({ amount: 0, prize_text: '₦50,000 Food Credit' }), '₦50,000 Food Credit');
  });

  it('falls back to ₦amount for cash', () => {
    assert.equal(custom.prizeLabel({ amount: 200 }), '₦200');
    assert.equal(custom.prizeLabel({ amount: 100000 }), '₦100,000');
  });

  it('renders a dash when there is no prize info', () => {
    assert.equal(custom.prizeLabel({ amount: 0 }), '—');
    assert.equal(custom.prizeLabel({}), '—');
  });
});

describe('calendar-hour cap', () => {
  it('startOfHour floors to :00:00 of the same hour', () => {
    const d = new Date(2026, 8, 21, 14, 37, 22);
    const s = custom.startOfHour(d);
    assert.equal(s.getHours(), 14);
    assert.equal(s.getMinutes(), 0);
    assert.equal(s.getSeconds(), 0);
    assert.equal(s.getDate(), 21);
  });

  it('a new hour means a fresh window', () => {
    const a = custom.startOfHour(new Date(2026, 8, 21, 14, 59));
    const b = custom.startOfHour(new Date(2026, 8, 21, 15, 0));
    assert.ok(b.getTime() > a.getTime());
  });
});

describe('cash-only wallet rule', () => {
  it('hourly draws are always cash', () => {
    assert.equal(custom.isCashDraw({ kind: 'hourly_200' }, null), true);
  });

  it('custom draws follow the giveaway category', () => {
    assert.equal(custom.isCashDraw({ kind: 'custom' }, { category: 'cash' }), true);
    assert.equal(custom.isCashDraw({ kind: 'custom' }, { category: 'others' }), false);
    assert.equal(custom.isCashDraw({ kind: 'custom' }, { category: 'food' }), false);
    assert.equal(custom.isCashDraw({ kind: 'custom' }, { category: 'gadgets' }), false);
    assert.equal(custom.isCashDraw({ kind: 'custom' }, null), false);
  });

  it('unknown kinds never touch the wallet', () => {
    assert.equal(custom.isCashDraw({ kind: 'mystery' }, { category: 'cash' }), false);
    assert.equal(custom.isCashDraw(null, null), false);
  });
});
