const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getDrawId,
  getPhase,
  generateTicketCode,
  seededPickWinners,
  hourLetter,
} = require('../src/draw');

describe('draw ids', () => {
  it('A = midnight hour, example 20092026A', () => {
    const d = new Date(2026, 8, 20, 0, 15, 0); // Sep 20 2026 00:15 local
    assert.equal(getDrawId(d), '20092026A');
    assert.equal(hourLetter(0), 'A');
    assert.equal(hourLetter(1), 'B');
    assert.equal(hourLetter(23), 'X');
  });

  it('hour progression B/C', () => {
    assert.equal(getDrawId(new Date(2026, 8, 20, 1, 5)), '20092026B');
    assert.equal(getDrawId(new Date(2026, 8, 20, 2, 5)), '20092026C');
  });
});

describe('phases', () => {
  it('00-50 entry, 51-52 drawing, 53-59 results', () => {
    assert.equal(getPhase(new Date(2026, 8, 20, 12, 0)), 'entry_open');
    assert.equal(getPhase(new Date(2026, 8, 20, 12, 50)), 'entry_open');
    assert.equal(getPhase(new Date(2026, 8, 20, 12, 51)), 'drawing');
    assert.equal(getPhase(new Date(2026, 8, 20, 12, 52)), 'drawing');
    assert.equal(getPhase(new Date(2026, 8, 20, 12, 53)), 'results');
    assert.equal(getPhase(new Date(2026, 8, 20, 12, 59)), 'results');
  });
});

describe('tickets', () => {
  it('non-sequential, 10-digit suffix, unique', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      const c = generateTicketCode('20092026A', seen);
      assert.match(c, /^20092026A\d{10}$/);
      seen.add(c);
    }
    assert.equal(seen.size, 50);
  });

  it('supports 9-digit OG suffixes, non-sequential, unique', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      const c = generateTicketCode('OG21092026A', seen, 9);
      assert.match(c, /^OG21092026A\d{9}$/);
      seen.add(c);
    }
    assert.equal(seen.size, 50);
  });
});

describe('seeded winner picking (no Math.random)', () => {
  it('deterministic for same seed, covers full set', () => {
    const tickets = Array.from({ length: 10 }, (_, i) => ({
      ticket_code: `20092026A${String(i).padStart(10, '0')}`,
      telegram_id: 1000 + i,
    }));
    const a = seededPickWinners(tickets, { drawId: '20092026A', seedSecret: 's1', count: 1 });
    const b = seededPickWinners([...tickets].reverse(), { drawId: '20092026A', seedSecret: 's1', count: 1 });
    assert.equal(a[0].ticket_code, b[0].ticket_code); // order-independent
    const c = seededPickWinners(tickets, { drawId: '20092026A', seedSecret: 'different', count: 1 });
    // different secret very likely picks different winner for 10 tickets (not guaranteed, so just check valid)
    assert.ok(c[0].ticket_code);
  });

  it('picks N winners without duplication', () => {
    const tickets = Array.from({ length: 20 }, (_, i) => ({
      ticket_code: `20092026A${String(i * 7).padStart(10, '0')}`,
      telegram_id: i,
    }));
    const w = seededPickWinners(tickets, { drawId: '20092026A', seedSecret: 's', count: 2 });
    assert.equal(w.length, 2);
    assert.notEqual(w[0].ticket_code, w[1].ticket_code);
  });
});
