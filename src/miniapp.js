// Authenticated Mini App API. Protected routes require validated Telegram initData
// (X-Telegram-Init-Data header), so the WebApp user can't be spoofed.
// Public routes (draw clock, results, sponsored) stay open for previews.
const config = require('./config');
const store = require('./store');
const { query } = require('./db');
const { getDrawId, getPhase } = require('./draw');
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

  // Sponsored / custom giveaways (public — also powers the preview)
  app.get('/api/miniapp/sponsored', async (_req, res) => {
    try {
      const r = await query(
        `SELECT id, name, category, amount, winners_per_draw, interval_minutes,
                starts_at, ends_at, scheduled_at, sponsor_name, sponsor_link, sponsor_bio, rules
         FROM giveaways WHERE status = 'active' ORDER BY created_at DESC LIMIT 10`
      );
      res.json(r.rows);
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

  // My tickets for a draw (defaults to current hour)
  app.get('/api/miniapp/my-tickets', auth, async (req, res) => {
    try {
      const drawId = req.query.drawId || getDrawId(new Date());
      const tickets = await store.getUserTickets(drawId, req.tgUser.id);
      res.json({ drawId, tickets, max: config.maxTicketsPerUser });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Open custom draws (auto-created by the scheduler worker) + my ticket count.
  app.get('/api/miniapp/custom-open', auth, async (req, res) => {
    try {
      const draws = await store.getOpenCustomDraws().catch(() => []);
      const out = [];
      for (const d of draws) {
        const myCount = await store.countUserTickets(d.id, req.tgUser.id).catch(() => 0);
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
      const code = await store.issueTicket(drawId, u.id, u.username);
      const count = await store.countUserTickets(drawId, u.id);
      res.json({ drawId, ticket_code: code, count, max: config.maxTicketsPerUser });
    } catch (e) {
      if (e.code === 'LIMIT') return res.status(429).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  return app;
}

module.exports = { mountMiniApp };
