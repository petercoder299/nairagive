// Weekly leaderboard helpers (pure — no DB).
// Week runs Monday 00:00:01 → Sunday 23:59:59 Africa/Lagos (UTC+1, no DST).
const WEEK_PRIZES = [5000, 3000, 2000];

function lagosWeekStart(now = new Date()) {
  const t = new Date(new Date(now).getTime() + 3600000);
  const back = (t.getUTCDay() + 6) % 7; // days since Monday
  const mondayLagosMidnight = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - back, 0, 0, 1);
  return new Date(mondayLagosMidnight - 3600000);
}

function weekWindows(now = new Date()) {
  const start = lagosWeekStart(now);
  const end = new Date(start.getTime() + 7 * 86400 * 1000 - 2000);
  const prevEnd = new Date(start.getTime() - 2000);
  const prevStart = new Date(start.getTime() - 7 * 86400 * 1000);
  return { start, end, prevStart, prevEnd };
}

module.exports = { WEEK_PRIZES, lagosWeekStart, weekWindows };
