const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateWithdrawal } = require('../src/withdrawals');

const good = {
  full_name: 'Adaeze Obi',
  account_number: '0123456789',
  bank_name: 'OPay',
  amount: 500,
};

describe('withdrawal validation (min ₦100)', () => {
  it('accepts a valid request', () => {
    const r = validateWithdrawal(good, 100);
    assert.equal(r.ok, true);
    assert.equal(r.value.amount, 500);
    assert.equal(r.value.accountNumber, '0123456789');
  });

  it('rejects below-minimum amounts', () => {
    assert.equal(validateWithdrawal({ ...good, amount: 99 }, 100).ok, false);
    assert.equal(validateWithdrawal({ ...good, amount: 50 }, 100).ok, false);
    assert.match(validateWithdrawal({ ...good, amount: 99 }, 100).error, /₦100/);
  });

  it('accepts exactly the minimum', () => {
    assert.equal(validateWithdrawal({ ...good, amount: 100 }, 100).ok, true);
  });

  it('rejects non-integer and non-numeric amounts', () => {
    assert.equal(validateWithdrawal({ ...good, amount: 100.5 }, 100).ok, false);
    assert.equal(validateWithdrawal({ ...good, amount: 'abc' }, 100).ok, false);
    assert.equal(validateWithdrawal({ ...good, amount: undefined }, 100).ok, false);
  });

  it('requires a 10-digit NUBAN account number', () => {
    assert.equal(validateWithdrawal({ ...good, account_number: '123456789' }, 100).ok, false);
    assert.equal(validateWithdrawal({ ...good, account_number: '12345678901' }, 100).ok, false);
    assert.equal(validateWithdrawal({ ...good, account_number: '12345abcde' }, 100).ok, false);
    // spaces/dashes are stripped before checking
    assert.equal(validateWithdrawal({ ...good, account_number: '0123 456 789' }, 100).ok, true);
  });

  it('requires full name and bank name', () => {
    assert.equal(validateWithdrawal({ ...good, full_name: '  ' }, 100).ok, false);
    assert.equal(validateWithdrawal({ ...good, bank_name: '' }, 100).ok, false);
  });
});

describe('manual adjustBalance validation (no DB touched)', () => {
  const { adjustBalance } = require('../src/store');

  it('rejects non-numeric telegram IDs', async () => {
    await assert.rejects(adjustBalance('abc', 100), /Telegram ID/);
    await assert.rejects(adjustBalance(-5, 100), /Telegram ID/);
  });

  it('rejects zero and non-numeric amounts', async () => {
    await assert.rejects(adjustBalance(123, 0), /nonzero/);
    await assert.rejects(adjustBalance(123, NaN), /nonzero/);
  });
});
