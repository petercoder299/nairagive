// Authenticated Mini App API. Protected routes require validated Telegram initData
// (X-Telegram-Init-Data header), so the WebApp user can't be spoofed.
// Public routes (draw clock, results, sponsored) stay open for previews.
const config = require('./config');
const store = require('./store');
const { query } = require('./db');
const { getDrawId, getPhase } = require('./draw');
const labelFor = require('./custom').drawLabel;
const startOfHour = require('./custom').startOfHour;
const ticketPrefixFor = require('./custom').ticketPrefixFor;
const { validateWithdrawal } = require('./withdrawals');
const { requireTelegramUserOrTest } = require('./telegramAuth');

function mountMiniApp(app) {
  const auth = requireTelegramUserOrTest(() => config.botToken, () => config.allowTestMode);

  // Profile + current draw snapshot for the Mini App shell
  app.get('/api/me', auth, async (req, res) => {
    try {
      const u = req.tgUser;
      const now = new Date();
      const drawId = getDrawId(now);
      const phase = getPhase(now);
      await store.upsertUser(u.id, u.username, u.first_name).catch(() => {});
      await store.ensureDraw({ drawId }).catch(() => {});
      const [tickets, wallet] = await Promise.all([
        store.getUserTickets(drawId, u.id).catch(() => []),
        store.getWallet(u.id).catch(() => 0),
      ]);
      res.json({
        user: { id: u.id, username: u.username, first_name: u.first_name, test: u.test === true },
        wallet,
        draw: { drawId, phase, amount: config.hourlyAmount, maxTickets: config.maxTicketsPerUser },
        myTickets: tickets,
        sponsor: config.sponsor,
        contact: config.contact.text,
        howTo: config.howToUse,
        rules: config.rulesText,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Wallet: balance + recent winnings
  app.get('/api/miniapp/wallet', auth, async (req, res) => {
    try {
      const [balance, wins] = await Promise.all([
        store.getWallet(req.tgUser.id).catch(() => 0),
        query(
          `SELECT w.draw_id, w.ticket_code, w.prize_amount, w.created_at
           FROM draw_winners w WHERE w.telegram_id = $1
           ORDER BY w.created_at DESC LIMIT 10`,
          [req.tgUser.id]
        ).then((r) => r.rows).catch(() => []),
      ]);
      res.json({ balance, wins });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Sponsored giveaways by category (public — also powers the preview).
  // Cash screen shows sponsored CASH only; Others screen uses ?category=others.
  app.get('/api/miniapp/sponsored', async (req, res) => {
    const category = req.query.category || 'cash';
    const fullSelect = (extraWhere) =>
      `SELECT id, name, category, amount, winners_per_draw, interval_minutes,
              starts_at, ends_at, scheduled_at, sponsor_name, sponsor_link, sponsor_bio, rules, sponsored, spotlight
       FROM giveaways WHERE status = 'active' AND category = $1${extraWhere} ORDER BY created_at DESC LIMIT 20`;
    try {
      try {
        const r = await query(fullSelect(''), [category]);
        return res.json(r.rows);
      } catch (_) {
        // Pre-migration DBs lack the newest columns — fall back gracefully.
        const r = await query(
          `SELECT id, name, category, amount, winners_per_draw, interval_minutes,
                  starts_at, ends_at, scheduled_at, sponsor_name, sponsor_link, sponsor_bio, rules
           FROM giveaways WHERE status = 'active' AND category = $1 ORDER BY created_at DESC LIMIT 20`,
          [category]
        );
        return res.json(r.rows);
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Claim one ticket in the current hourly draw
  app.post('/api/miniapp/tickets', auth, async (req, res) => {
    try {
      const u = req.tgUser;
      const now = new Date();
      if (getPhase(now) !== 'entry_open') {
        return res.status(403).json({
          error: 'Entry is closed right now. Winners picked :51–:52, results :53–:59. New draw at the top of the hour.',
        });
      }
      const drawId = getDrawId(now);
      await store.upsertUser(u.id, u.username, u.first_name).catch(() => {});
      await store.ensureDraw({ drawId }).catch(() => {});
      const code = await store.issueTicket(drawId, u.id, u.username);
      const count = await store.countUserTickets(drawId, u.id);
      res.json({ drawId, ticket_code: code, count, max: config.maxTicketsPerUser });
    } catch (e) {
      if (e.code === 'LIMIT') return res.status(429).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // My tickets for a draw (defaults to current hour), with ticket label.
  app.get('/api/miniapp/my-tickets', auth, async (req, res) => {
    try {
      const drawId = req.query.drawId || getDrawId(new Date());
      const [tickets, draw] = await Promise.all([
        store.getUserTickets(drawId, req.tgUser.id),
        store.getDraw(drawId).catch(() => null),
      ]);
      let giveaway = null;
      if (draw && draw.giveaway_id) {
        giveaway = await store.getGiveaway(draw.giveaway_id).catch(() => null);
      }
      res.json({ drawId, tickets, max: config.maxTicketsPerUser, label: labelFor(draw, giveaway) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Full draw detail for a giveaway page: draw + giveaway + winners + my tickets + label.
  app.get('/api/miniapp/draw/:drawId', auth, async (req, res) => {
    try {
      const draw = await store.getDraw(req.params.drawId);
      if (!draw) return res.status(404).json({ error: 'Draw not found.' });
      let giveaway = null;
      if (draw.giveaway_id) {
        giveaway = await store.getGiveaway(draw.giveaway_id).catch(() => null);
      }
      const [winners, myTickets, myHourCount] = await Promise.all([
        store.getWinners(draw.id).catch(() => []),
        store.getUserTickets(draw.id, req.tgUser.id).catch(() => []),
        store.countUserTicketsSince(draw.id, req.tgUser.id, startOfHour()).catch(() => 0),
      ]);
      res.json({ draw, giveaway, winners, myTickets, myHourCount, max: config.maxTicketsPerUser, label: labelFor(draw, giveaway) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Open custom draws (auto-created by the scheduler worker) + my ticket count.
  app.get('/api/miniapp/custom-open', auth, async (req, res) => {
    try {
      const draws = await store.getOpenCustomDraws().catch(() => []);
      const out = [];
      const hourStart = startOfHour();
      for (const d of draws) {
        const myCount = await store.countUserTicketsSince(d.id, req.tgUser.id, hourStart).catch(() => 0);
        out.push({
          drawId: d.id,
          amount: d.amount,
          winnersCount: d.winners_count,
          closesAt: d.entry_closes_at,
          myCount,
          max: config.maxTicketsPerUser,
          giveaway: {
            id: d.giveaway_id,
            name: d.giveaway_name,
            category: d.giveaway_category,
            sponsor: d.g_sponsor_name,
            rules: d.g_rules,
            sponsored: d.g_sponsored,
          },
        });
      }
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Claim one ticket in an open custom draw.
  app.post('/api/miniapp/custom-tickets', auth, async (req, res) => {
    try {
      const u = req.tgUser;
      const drawId = (req.body && req.body.drawId) || '';
      const draw = await store.getDraw(drawId);
      if (!draw || draw.kind !== 'custom' || draw.status !== 'entry_open') {
        return res.status(403).json({ error: 'That draw is not open for entry right now.' });
      }
      await store.upsertUser(u.id, u.username, u.first_name).catch(() => {});
      // Entry-stamped tickets: PREFIX + entry date + entry hour letter
      // (e.g. entering 12:30am 23 Sep → CASH0123092026A + random digits).
      let digits = 10;
      let stamp = null;
      if (draw.giveaway_id) {
        const g = await store.getGiveaway(draw.giveaway_id).catch(() => null);
        if (g) {
          if (g.ticket_digits) digits = g.ticket_digits;
          if (g.draw_prefix) stamp = ticketPrefixFor(g, new Date());
        }
      }
      const code = await store.issueTicket(drawId, u.id, u.username, digits, true, stamp);
      const count = await store.countUserTicketsSince(drawId, u.id, startOfHour());
      res.json({ drawId, ticket_code: code, count, max: config.maxTicketsPerUser });
    } catch (e) {
      if (e.code === 'LIMIT') return res.status(429).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // My withdrawal requests
  app.get('/api/miniapp/withdrawals', auth, async (req, res) => {
    try {
      res.json(await store.getUserWithdrawals(req.tgUser.id));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Request a withdrawal (min ₦100). Balance is debited immediately;
  // admin pays out manually, or rejects (which refunds).
  app.post('/api/miniapp/withdrawals', auth, async (req, res) => {
    try {
      const v = validateWithdrawal(req.body || {}, config.withdrawMin);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const u = req.tgUser;
      await store.upsertUser(u.id, u.username, u.first_name).catch(() => {});
      const r = await store.createWithdrawal({
        telegramId: u.id,
        username: u.username,
        fullName: v.value.fullName,
        accountNumber: v.value.accountNumber,
        bankName: v.value.bankName,
        amount: v.value.amount,
      });
      res.json({ withdrawal: r.withdrawal, balance: r.balance });
    } catch (e) {
      if (e.code === 'INSUFFICIENT') return res.status(400).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  return app;
}

module.exports = { mountMiniApp };
