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

function customDrawId(giveawayId, windowStart) {
  return `G${giveawayId}-${fmtWindowUTC(new Date(windowStart))}`;
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

function oneOffDrawId(giveawayId) {
  return `G${giveawayId}-ONCE`;
}

module.exports = {
  pad,
  fmtWindowUTC,
  customDrawId,
  oneOffDrawId,
  isIntervalGiveaway,
  isOneOffGiveaway,
  currentWindow,
  windowCount,
  oneOffState,
};
