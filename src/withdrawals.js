// Withdrawal request validation (pure — no DB). Nigerian NUBAN = 10 digits.
function validateWithdrawal(input, min = 100) {
  const fullName = String((input && input.full_name) || '').trim();
  const accountNumber = String((input && input.account_number) || '').replace(/[\s-]/g, '');
  const bankName = String((input && input.bank_name) || '').trim();
  const amount = Number(input && input.amount);

  if (!fullName) return { ok: false, error: 'Full name on account is required.' };
  if (fullName.length > 100) return { ok: false, error: 'Full name is too long.' };
  if (!/^\d{10}$/.test(accountNumber)) {
    return { ok: false, error: 'Account number must be exactly 10 digits.' };
  }
  if (!bankName) return { ok: false, error: 'Bank name is required.' };
  if (bankName.length > 60) return { ok: false, error: 'Bank name is too long.' };
  if (!Number.isInteger(amount) || amount < min) {
    return { ok: false, error: `Minimum withdrawal is ₦${min}.` };
  }
  return { ok: true, value: { fullName, accountNumber, bankName, amount } };
}

module.exports = { validateWithdrawal };
