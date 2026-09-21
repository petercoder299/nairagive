// Validates Telegram Mini App initData per official docs.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// secret_key = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)
// check = HMAC_SHA256(key=secret_key, msg=data_check_string)
// data_check_string = sorted "key=<value>" lines (excluding hash), joined with "\n".
const crypto = require('crypto');

const MAX_AGE_SECONDS = 24 * 3600;

function parseInitData(initData) {
  const params = new URLSearchParams(initData || '');
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function buildDataCheckString(params) {
  return Object.keys(params)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n');
}

function validateInitData(initData, botToken, maxAgeSeconds = MAX_AGE_SECONDS) {
  if (!initData) return { ok: false, error: 'missing initData' };
  if (!botToken) return { ok: false, error: 'server misconfigured: BOT_TOKEN missing' };
  let params;
  try {
    params = parseInitData(initData);
  } catch (_) {
    return { ok: false, error: 'malformed initData' };
  }
  const hash = params.hash;
  if (!hash) return { ok: false, error: 'missing hash' };

  const dataCheckString = buildDataCheckString(params);
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(String(hash), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'bad signature' };
  }

  const authDate = parseInt(params.auth_date || '0', 10);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    return { ok: false, error: 'initData expired' };
  }

  let user = null;
  try {
    user = JSON.parse(params.user || 'null');
  } catch (_) {
    return { ok: false, error: 'bad user payload' };
  }
  if (!user || !user.id) return { ok: false, error: 'no user in initData' };
  return { ok: true, user, authDate };
}

// Express middleware: reads raw initData from X-Telegram-Init-Data header
// (or ?tgWebAppData query param), validates, attaches req.tgUser.
function requireTelegramUser(getBotToken) {
  return (req, res, next) => {
    const initData =
      req.headers['x-telegram-init-data'] || req.query.tgWebAppData || (req.body && req.body.initData);
    const result = validateInitData(initData, getBotToken());
    if (!result.ok) return res.status(401).json({ error: 'telegram auth failed: ' + result.error });
    req.tgUser = result.user;
    next();
  };
}

// Browser test mode (DEV ONLY — never enable in production).
// Lets index.html run fully in a desktop browser without Telegram:
// the client sends X-Test-User: "<id>:<username>:<first_name>" and the
// server trusts it ONLY when allowTestMode() returns true.
function requireTelegramUserOrTest(getBotToken, allowTestMode) {
  const strict = requireTelegramUser(getBotToken);
  return (req, res, next) => {
    const hasInitData =
      req.headers['x-telegram-init-data'] || req.query.tgWebAppData || (req.body && req.body.initData);
    if (hasInitData || !allowTestMode()) return strict(req, res, next);
    const raw = req.headers['x-test-user'];
    if (!raw)
      return res.status(401).json({ error: 'open via Telegram, or enable ALLOW_TEST_MODE and send X-Test-User' });
    const parts = String(raw).split(':');
    const id = parseInt(parts[0], 10);
    if (!id)
      return res.status(401).json({ error: 'bad X-Test-User format. Use "<telegram_id>:<username>:<first_name>"' });
    req.tgUser = { id, username: parts[1] || 'tester' + id, first_name: parts[2] || 'Tester', test: true };
    next();
  };
}

module.exports = {
  MAX_AGE_SECONDS,
  parseInitData,
  buildDataCheckString,
  validateInitData,
  requireTelegramUser,
  requireTelegramUserOrTest,
};
