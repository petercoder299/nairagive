// Monetag rewarded postback verification (pure parsing — no DB).
// Monetag calls our URL with macros per event; YMID uniquely identifies
// each event so replays/fraud duplicates are dropped by DB constraint.
function parsePostback(q) {
  const v = (k) => {
    const x = q[k];
    return x === undefined || x === null || x === '' ? null : String(x);
  };
  const event = v('event');
  if (event !== 'impression' && event !== 'click') {
    return { ok: false, error: 'event must be impression or click' };
  }
  const ymid = v('ymid');
  if (!ymid) return { ok: false, error: 'ymid is required' };
  const num = (k) => {
    const x = v(k);
    if (x === null) return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };
  const rawTg = v('telegram_id');
  let telegramId = null;
  if (rawTg !== null) {
    const n = Number(rawTg);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'bad telegram_id' };
    telegramId = n;
  }
  return {
    ok: true,
    value: {
      telegramId,
      appId: num('app_id'),
      zoneId: num('zone_id'),
      subzoneId: num('subzone_id'),
      event,
      reward: v('reward'),
      price: num('price'),
      ymid,
      requestVar: v('request_var'),
    },
  };
}

module.exports = { parsePostback };
