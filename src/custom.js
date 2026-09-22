// Custom giveaway engine (pure logic — no DB, no timers).
// Covers deen.txt cases:
//   - interval: "₦100 every 5 min for 3h" / "₦400 every 1 min for 10 min x2"
//   - one-off:  "₦100,000 x2 winners on 5/10/2026 at 6pm"
// Draw IDs look like G7-202610051800 (giveaway id + UTC window start).
// UTC is used so IDs are stable regardless of server TZ.

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function fmtWindowUTC(d) {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes())
  );
}

// Local (server time, Africa/Lagos) DDMMYYYY + hour letter A..X,
// same alphabet as the hourly cash draws: A = 00:00–01:00 … X = 23:00–00:00.
function fmtLocalDay(d) {
  const x = new Date(d);
  return pad(x.getDate()) + pad(x.getMonth() + 1) + x.getFullYear();
}

function hourLetterLocal(d) {
  return String.fromCharCode(65 + new Date(d).getHours());
}

// Ticket/draw prefix for a giveaway at a given moment:
// PREFIX + 2-digit sequence + local DDMMYYYY + local hour letter.
// E.g. entering 12:30am 23 Sep on the first CASH giveaway stamps CASH0123092026A.
// seq = draw_seq (per-prefix order) falling back to the row id.
function ticketPrefixFor(g, date) {
  const d = new Date(date);
  const seq = g.draw_seq || g.id;
  return `${g.draw_prefix}${pad(seq)}${fmtLocalDay(d)}${hourLetterLocal(d)}`;
}

// Draw ID for an interval window: the prefix stamped at the window start
// (e.g. giveaway #1 opening 12:33am 21 Sep → OG0121092026A).
// Giveaways without a prefix use G<id>-<UTC>.
function customDrawId(idOrGiveaway, windowStart) {
  const g = typeof idOrGiveaway === 'object' && idOrGiveaway !== null ? idOrGiveaway : { id: idOrGiveaway };
  if (g.draw_prefix) return ticketPrefixFor(g, windowStart);
  return `G${g.id}-${fmtWindowUTC(new Date(windowStart))}`;
}

function isIntervalGiveaway(g) {
  return g && g.interval_minutes != null && Number(g.interval_minutes) > 0;
}

function isOneOffGiveaway(g) {
  return g && !isIntervalGiveaway(g) && !!g.scheduled_at;
}

// Current entry window for an interval giveaway at `now`.
// Returns null when outside [starts_at, ends_at).
function currentWindow(g, now = new Date()) {
  if (!isIntervalGiveaway(g) || !g.starts_at || !g.ends_at) return null;
  const start = new Date(g.starts_at).getTime();
  const end = new Date(g.ends_at).getTime();
  const t = new Date(now).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || t < start || t >= end) return null;
  const ivMs = Number(g.interval_minutes) * 60 * 1000;
  const idx = Math.floor((t - start) / ivMs);
  const windowStart = new Date(start + idx * ivMs);
  const windowEnd = new Date(Math.min(windowStart.getTime() + ivMs, end));
  return { index: idx, start: windowStart, end: windowEnd };
}

// How many windows an interval giveaway spans (for tests/admin preview).
function windowCount(g) {
  if (!isIntervalGiveaway(g) || !g.starts_at || !g.ends_at) return 0;
  const ms = new Date(g.ends_at).getTime() - new Date(g.starts_at).getTime();
  if (!(ms > 0)) return 0;
  return Math.ceil(ms / (Number(g.interval_minutes) * 60 * 1000));
}

// One-off draw state at `now`: 'upcoming' | 'due'.
// 'due' means entry is closed and the winner(s) must be picked.
function oneOffState(g, now = new Date()) {
  if (!isOneOffGiveaway(g)) return null;
  return new Date(now).getTime() >= new Date(g.scheduled_at).getTime() ? 'due' : 'upcoming';
}

function oneOffDrawId(idOrGiveaway) {
  const g = typeof idOrGiveaway === 'object' && idOrGiveaway !== null ? idOrGiveaway : { id: idOrGiveaway };
  // Prefixed one-offs use the giveaway's own creation time so the ID is
  // stable across scheduler ticks (e.g. giveaway #1 created 12:33am 21 Sep
  // → OG0121092026A). Creation hour sets the letter, exactly like hourly.
  if (g.draw_prefix) {
    const base = new Date(g.created_at || g.scheduled_at || Date.now());
    return ticketPrefixFor(g, base);
  }
  return `G${g.id}-ONCE`;
}

// Start of the current clock hour (server local time, Africa/Lagos).
// Custom draws allow 10 tickets per calendar hour: a fresh 10 every :00.
function startOfHour(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}
// Human prize label: prize_text wins (non-cash), else ₦amount, else em dash.
function prizeLabel(giveawayOrDraw) {
  const g = giveawayOrDraw || {};
  if (g.prize_text) return g.prize_text;
  if (Number(g.amount) > 0) return '₦' + Number(g.amount).toLocaleString('en-NG');
  return '—';
}
// Ticket label so users can tell draws apart: CASH, GADGET, NETFLIX…
function drawLabel(draw, giveaway) {
  if (giveaway) {
    return { chip: String(giveaway.category || 'custom').toUpperCase(), title: giveaway.name };
  }
  return { chip: 'CASH', title: '₦200 Hourly' };
}

module.exports = {
  pad,
  fmtWindowUTC,
  fmtLocalDay,
  hourLetterLocal,
  ticketPrefixFor,
  customDrawId,
  oneOffDrawId,
  isIntervalGiveaway,
  isOneOffGiveaway,
  currentWindow,
  windowCount,
  oneOffState,
  drawLabel,
  prizeLabel,
  startOfHour,
};
