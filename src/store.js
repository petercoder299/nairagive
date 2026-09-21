const { query, getPool } = require('./db');
const config = require('./config');
const { generateTicketCode, seededPickWinners } = require('./draw');

async function upsertUser(telegramId, username, firstName) {
  await query(
    `INSERT INTO users (telegram_id, username, first_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       updated_at = NOW()`,
    [telegramId, username || null, firstName || null]
  );
}

async function ensureDraw({
  drawId,
  kind = 'hourly_200',
  amount = config.hourlyAmount,
  winnersCount = 1,
  giveawayId = null,
  sponsor = null,
  entryClosesAt = null,
}) {
  const existing = await query('SELECT * FROM draws WHERE id = $1', [drawId]);
  if (existing.rows.length) return existing.rows[0];
  const sp = sponsor || config.sponsor;
  const res = await query(
    `INSERT INTO draws (id, kind, amount, winners_count, status, sponsor_name, sponsor_link, sponsor_bio, hour_started_at, giveaway_id, entry_closes_at)
     VALUES ($1,$2,$3,$4,'entry_open',$5,$6,$7,NOW(),$8,$9)
     RETURNING *`,
    [drawId, kind, amount, winnersCount, sp.name, sp.link, sp.bio, giveawayId, entryClosesAt]
  );
  return res.rows[0];
}

async function getDraw(drawId) {
  const res = await query('SELECT * FROM draws WHERE id = $1', [drawId]);
  return res.rows[0] || null;
}

async function countUserTickets(drawId, telegramId) {
  const res = await query('SELECT COUNT(*)::int AS c FROM tickets WHERE draw_id=$1 AND telegram_id=$2', [
    drawId,
    telegramId,
  ]);
  return res.rows[0].c;
}

async function getUserTickets(drawId, telegramId) {
  const res = await query('SELECT ticket_code FROM tickets WHERE draw_id=$1 AND telegram_id=$2 ORDER BY created_at', [
    drawId,
    telegramId,
  ]);
  return res.rows.map((r) => r.ticket_code);
}

async function issueTicket(drawId, telegramId, username, digits = 10) {
  // Enforce max 10 per user per draw
  const count = await countUserTickets(drawId, telegramId);
  if (count >= config.maxTicketsPerUser) {
    const err = new Error(`Ticket limit reached (max ${config.maxTicketsPerUser} per draw).`);
    err.code = 'LIMIT';
    throw err;
  }
  // Generate unique non-sequential code
  for (let i = 0; i < 10; i++) {
    const code = generateTicketCode(drawId, new Set(), digits);
    try {
      await query('INSERT INTO tickets (ticket_code, draw_id, telegram_id, username) VALUES ($1,$2,$3,$4)', [
        code,
        drawId,
        telegramId,
        username || null,
      ]);
      return code;
    } catch (e) {
      if (e.code === '23505') continue; // collision, retry
      throw e;
    }
  }
  throw new Error('Could not generate unique ticket, try again.');
}

async function getTicketsForDraw(drawId) {
  const res = await query('SELECT ticket_code, telegram_id, username FROM tickets WHERE draw_id=$1', [drawId]);
  return res.rows;
}

async function getWinners(drawId) {
  const res = await query('SELECT * FROM draw_winners WHERE draw_id=$1 ORDER BY position', [drawId]);
  return res.rows;
}

async function setDrawStatus(drawId, status) {
  await query('UPDATE draws SET status=$2 WHERE id=$1', [drawId, status]);
}

// Seeded draw: picks winners_count winners, credits wallets, records draw_winners.
async function runSeededDraw(drawId) {
  const draw = await getDraw(drawId);
  if (!draw) throw new Error(`Draw not found: ${drawId}`);
  const already = await getWinners(drawId);
  if (already.length) return already; // idempotent

  const tickets = await getTicketsForDraw(drawId);
  await setDrawStatus(drawId, 'drawing');

  if (!tickets.length) {
    await setDrawStatus(drawId, 'closed');
    await query('UPDATE draws SET drawn_at=NOW() WHERE id=$1', [drawId]);
    return [];
  }

  const winners = seededPickWinners(tickets, {
    drawId,
    seedSecret: config.winnerSeedSecret,
    count: draw.winners_count || 1,
  });

  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    await query(
      `INSERT INTO draw_winners (draw_id, ticket_code, telegram_id, username, prize_amount, position)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [drawId, w.ticket_code, w.telegram_id, w.username || null, draw.amount, i + 1]
    );
    await query('UPDATE users SET wallet_balance = wallet_balance + $2, updated_at=NOW() WHERE telegram_id=$1', [
      w.telegram_id,
      draw.amount,
    ]);
  }
  await query(`UPDATE draws SET status='results', drawn_at=NOW() WHERE id=$1`, [drawId]);
  return getWinners(drawId);
}

async function getWallet(telegramId) {
  const res = await query('SELECT wallet_balance FROM users WHERE telegram_id=$1', [telegramId]);
  if (!res.rows.length) return 0;
  return res.rows[0].wallet_balance;
}

async function getRecentResults(limit = 5) {
  const res = await query(
    `SELECT d.id, d.amount, d.drawn_at, w.ticket_code, w.username
     FROM draws d LEFT JOIN draw_winners w ON w.draw_id = d.id
     WHERE d.status IN ('results','closed')
     ORDER BY d.drawn_at DESC NULLS LAST, d.id DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

// ---- Custom giveaways ----
async function getActiveGiveaways() {
  const res = await query(`SELECT * FROM giveaways WHERE status = 'active' ORDER BY id`);
  return res.rows;
}

async function getGiveaway(id) {
  const res = await query(`SELECT * FROM giveaways WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function markGiveawayDone(id) {
  await query(`UPDATE giveaways SET status = 'done' WHERE id = $1`, [id]);
}

// Open custom draws with their giveaway info (for entry UI + worker).
async function getOpenCustomDraws() {
  const res = await query(
    `SELECT d.*, g.name AS giveaway_name, g.category AS giveaway_category,
            g.sponsor_name AS g_sponsor_name, g.rules AS g_rules
     FROM draws d JOIN giveaways g ON g.id = d.giveaway_id
     WHERE d.kind = 'custom' AND d.status = 'entry_open'
     ORDER BY d.entry_closes_at NULLS LAST, d.id`
  );
  return res.rows;
}

// Custom draws of one giveaway whose entry window has passed but never drawn.
async function getOverdueCustomDraws(now = new Date()) {
  const res = await query(
    `SELECT * FROM draws
     WHERE kind = 'custom' AND status = 'entry_open'
       AND entry_closes_at IS NOT NULL AND entry_closes_at <= $1`,
    [now.toISOString()]
  );
  return res.rows;
}

// ---- Withdrawals (balance debit + request are one transaction) ----
async function createWithdrawal({ telegramId, username, fullName, accountNumber, bankName, amount }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(
      `UPDATE users SET wallet_balance = wallet_balance - $2, updated_at = NOW()
       WHERE telegram_id = $1 AND wallet_balance >= $2 RETURNING wallet_balance`,
      [telegramId, amount]
    );
    if (!u.rows.length) {
      const err = new Error('Insufficient balance.');
      err.code = 'INSUFFICIENT';
      throw err;
    }
    const w = await client.query(
      `INSERT INTO withdrawals (telegram_id, username, full_name, account_number, bank_name, amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [telegramId, username || null, fullName, accountNumber, bankName, amount]
    );
    await client.query('COMMIT');
    return { withdrawal: w.rows[0], balance: u.rows[0].wallet_balance };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getUserWithdrawals(telegramId) {
  const res = await query(
    `SELECT id, full_name, account_number, bank_name, amount, status, created_at
     FROM withdrawals WHERE telegram_id = $1 ORDER BY id DESC LIMIT 20`,
    [telegramId]
  );
  return res.rows;
}

async function getWithdrawals(status = 'pending') {
  if (status === 'all') {
    const res = await query(`SELECT * FROM withdrawals ORDER BY id DESC LIMIT 100`);
    return res.rows;
  }
  const res = await query(`SELECT * FROM withdrawals WHERE status = $1 ORDER BY id DESC LIMIT 100`, [status]);
  return res.rows;
}

// Admin decision: 'paid' (money already debited at request time) or
// 'rejected' (refunds the amount). Idempotent — only pending rows move.
async function resolveWithdrawal(id, decision) {
  if (decision !== 'paid' && decision !== 'rejected') throw new Error('Bad decision.');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`, [id]);
    if (!cur.rows.length) {
      const err = new Error('Withdrawal not found.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const w = cur.rows[0];
    if (w.status === 'pending') {
      await client.query(`UPDATE withdrawals SET status = $2, processed_at = NOW() WHERE id = $1`, [
        id,
        decision,
      ]);
      if (decision === 'rejected') {
        await client.query(
          `UPDATE users SET wallet_balance = wallet_balance + $2, updated_at = NOW() WHERE telegram_id = $1`,
          [w.telegram_id, w.amount]
        );
      }
      w.status = decision;
    }
    await client.query('COMMIT');
    return w;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  upsertUser,
  ensureDraw,
  getDraw,
  countUserTickets,
  getUserTickets,
  issueTicket,
  getTicketsForDraw,
  getWinners,
  setDrawStatus,
  runSeededDraw,
  getWallet,
  getRecentResults,
  getActiveGiveaways,
  getGiveaway,
  markGiveawayDone,
  getOpenCustomDraws,
  getOverdueCustomDraws,
  createWithdrawal,
  getUserWithdrawals,
  getWithdrawals,
  resolveWithdrawal,
};
