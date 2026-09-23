const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parsePostback } = require('../src/monetag');

describe('monetag postback parsing', () => {
  const good = {
    telegram_id: '900001',
    app_id: '123',
    zone_id: '11866156',
    subzone_id: '7',
    event: 'impression',
    reward: 'yes',
    price: '0.01234',
    ymid: 'evt-abc-123',
    request_var: 'ticket3',
  };

  it('accepts a full valid postback', () => {
    const r = parsePostback(good);
    assert.equal(r.ok, true);
    assert.equal(r.value.telegramId, 900001);
    assert.equal(r.value.zoneId, 11866156);
    assert.equal(r.value.event, 'impression');
    assert.equal(r.value.price, 0.01234);
    assert.equal(r.value.ymid, 'evt-abc-123');
  });

  it('accepts clicks too, telegram_id optional', () => {
    const r = parsePostback({ event: 'click', ymid: 'x1' });
    assert.equal(r.ok, true);
    assert.equal(r.value.telegramId, null);
  });

  it('rejects bad event types and missing ymid', () => {
    assert.equal(parsePostback({ ...good, event: 'view' }).ok, false);
    const { ymid, ...noYmid } = good;
    assert.equal(parsePostback(noYmid).ok, false);
  });

  it('rejects invalid telegram ids', () => {
    assert.equal(parsePostback({ ...good, telegram_id: 'abc' }).ok, false);
    assert.equal(parsePostback({ ...good, telegram_id: '-5' }).ok, false);
  });

  it('stores valued/non_valued reward flags as-is', () => {
    assert.equal(parsePostback({ ...good, reward: 'valued' }).value.reward, 'valued');
    assert.equal(parsePostback({ ...good, reward: 'non_valued' }).value.reward, 'non_valued');
  });
});
