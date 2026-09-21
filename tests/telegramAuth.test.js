const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { validateInitData, requireTelegramUserOrTest } = require('../src/telegramAuth');

const BOT_TOKEN = '123456:TEST-token-for-unit-tests';

// Build a properly signed initData string (same algorithm Telegram uses)
function signInitData(params, token) {
  const dcs = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  const q = new URLSearchParams({ ...params, hash });
  return q.toString();
}

const userPayload = JSON.stringify({ id: 999, first_name: 'Test', username: 'tester' });

describe('telegram initData auth', () => {
  it('accepts correctly signed initData', () => {
    const initData = signInitData(
      { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE', user: userPayload },
      BOT_TOKEN
    );
    const r = validateInitData(initData, BOT_TOKEN);
    assert.equal(r.ok, true);
    assert.equal(r.user.id, 999);
    assert.equal(r.user.username, 'tester');
  });

  it('rejects tampered payload', () => {
    const initData = signInitData(
      { auth_date: String(Math.floor(Date.now() / 1000)), user: userPayload },
      BOT_TOKEN
    );
    const tampered = initData.replace('tester', 'attacker');
    assert.equal(validateInitData(tampered, BOT_TOKEN).ok, false);
  });

  it('rejects wrong bot token', () => {
    const initData = signInitData(
      { auth_date: String(Math.floor(Date.now() / 1000)), user: userPayload },
      BOT_TOKEN
    );
    assert.equal(validateInitData(initData, 'other-token').ok, false);
  });

  it('rejects expired initData', () => {
    const old = String(Math.floor(Date.now() / 1000) - 30 * 3600);
    const initData = signInitData({ auth_date: old, user: userPayload }, BOT_TOKEN);
    const r = validateInitData(initData, BOT_TOKEN);
    assert.equal(r.ok, false);
    assert.match(r.error, /expired/);
  });

  it('rejects missing/unsigned initData', () => {
    assert.equal(validateInitData('', BOT_TOKEN).ok, false);
    assert.equal(validateInitData('user=abc&auth_date=1', BOT_TOKEN).ok, false);
  });
});

describe('test-mode middleware (X-Test-User)', () => {
  function req(headers) {
    return { headers, query: {}, body: {} };
  }
  function res() {
    const r = { statusCode: 200, body: null };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  }
  it('accepts X-Test-User when test mode is on', () => {
    const mw = requireTelegramUserOrTest(() => BOT_TOKEN, () => true);
    const q = req({ 'x-test-user': '900001:browser_tester:Browser' });
    const s = res();
    let nexted = false;
    mw(q, s, () => { nexted = true; });
    assert.equal(nexted, true);
    assert.equal(q.tgUser.id, 900001);
    assert.equal(q.tgUser.username, 'browser_tester');
    assert.equal(q.tgUser.test, true);
  });
  it('rejects with 401 when test mode is off and no initData', () => {
    const mw = requireTelegramUserOrTest(() => BOT_TOKEN, () => false);
    const q = req({});
    const s = res();
    let nexted = false;
    mw(q, s, () => { nexted = true; });
    assert.equal(nexted, false);
    assert.equal(s.statusCode, 401);
  });
  it('still validates real initData when test mode is on', () => {
    const mw = requireTelegramUserOrTest(() => BOT_TOKEN, () => true);
    const signed = signInitData(
      { auth_date: String(Math.floor(Date.now() / 1000)), user: userPayload },
      BOT_TOKEN
    );
    const q = req({ 'x-telegram-init-data': signed });
    const s = res();
    let nexted = false;
    mw(q, s, () => { nexted = true; });
    assert.equal(nexted, true);
    assert.equal(q.tgUser.id, 999);
  });
});
