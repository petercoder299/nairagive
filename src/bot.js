const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const { getDrawId, getPhase, displayWinner } = require('./draw');
const { prizeLabel } = require('./custom');
const store = require('./store');
const { trackChat } = require('./scheduler');

const CATEGORIES = ['💵 Cash / Money', '📱 Airtime', '🌐 Data Bundles', '🎧 Gadgets', '🍔 Food', '🎁 Others'];

function mainMenu() {
  return Markup.keyboard([
    ['🎟️ Enter Giveaway', 'ℹ️ How To Use App'],
    ['👛 Wallet', '☎️ Contact Us'],
  ]).resize();
}

function entryPageText(drawId, phase, count, tickets) {
  const sponsor = config.sponsor;
  const phaseLine =
    phase === 'entry_open'
      ? '✅ Entry OPEN (00–50 mins each hour)'
      : phase === 'drawing'
        ? '🎲 Drawing winners (51–52 mins)... entry closed'
        : '🏆 Results showing (53–59 mins)... entry closed, next draw at top of hour';
  return (
    `💵 *₦${config.hourlyAmount} Hourly Giveaway*\n` +
    `Draw: \`${drawId}\`\n${phaseLine}\n\n` +
    `🎟️ Your tickets this draw: ${count}/${config.maxTicketsPerUser}\n` +
    (tickets.length ? tickets.map((t) => `• \`${t}\``).join('\n') + '\n\n' : '\n') +
    `🤝 *Sponsor:* ${sponsor.name}\n🔗 ${sponsor.link}\n📝 ${sponsor.bio}\n\n` +
    `Tap "🎫 Get Ticket" to enter (max ${config.maxTicketsPerUser} per hour).`
  );
}

function createBot() {
  if (!config.botToken) throw new Error('BOT_TOKEN missing');
  const bot = new Telegraf(config.botToken);

  bot.start(async (ctx) => {
    const u = ctx.from;
    await store.upsertUser(u.id, u.username, u.first_name).catch((e) => console.error('[bot] upsert', e.message));
    trackChat(ctx.chat && ctx.chat.id);
    await ctx.reply(
      `👋 Welcome ${u.first_name || 'friend'}!\n\nNairaGiveBot gives away money, airtime, data, gadgets & food.\nChoose an option below:`,
      mainMenu()
    );
    if (config.miniAppUrl) {
      await ctx
        .reply(
          'Or open the Mini App for the full experience (live clock, tickets, wallet):',
          Markup.inlineKeyboard([[Markup.button.webApp('Open Mini App', config.miniAppUrl)]])
        )
        .catch(() => {});
    }
  });

  bot.command('app', async (ctx) => {
    if (!config.miniAppUrl) {
      await ctx.reply('Mini App URL is not configured yet (MINI_APP_URL). Meanwhile use the buttons below:', mainMenu());
      return;
    }
    await ctx.reply(
      'Tap to open the NairaGiveBot Mini App:',
      Markup.inlineKeyboard([[Markup.button.webApp('Open Mini App', config.miniAppUrl)]])
    );
  });

  bot.hears('🎟️ Enter Giveaway', async (ctx) => {
    trackChat(ctx.chat && ctx.chat.id);
    await ctx.reply(
      'Choose a giveaway category:',
      Markup.inlineKeyboard([
        ...CATEGORIES.map((c) => [Markup.button.callback(c, `cat:${c}`)]),
      ])
    );
  });

  bot.hears('ℹ️ How To Use App', async (ctx) => {
    await ctx.reply(config.howToUse, mainMenu());
  });

  bot.hears('👛 Wallet', async (ctx) => {
    const u = ctx.from;
    await store.upsertUser(u.id, u.username, u.first_name).catch(() => {});
    const bal = await store.getWallet(u.id).catch(() => 0);
    await ctx.reply(`👛 *Wallet*\n\n@${u.username || u.id}\nBalance: ₦${bal}\n\nWinnings are credited automatically after each draw.`, {
      parse_mode: 'Markdown',
      ...mainMenu(),
    });
  });

  bot.hears('☎️ Contact Us', async (ctx) => {
    await ctx.reply(`☎️ *Contact Us*\n\n${config.contact.text}`, { parse_mode: 'Markdown', ...mainMenu() });
  });

  // Category selection
  bot.action(/cat:(.+)/, async (ctx) => {
    const cat = ctx.match[1];
    await ctx.answerCbQuery();
    if (!cat.includes('Cash')) {
      await ctx.reply(`"${cat}" is coming soon! 🚧\n\nWe are starting with Cash first — tap below to enter the ₦${config.hourlyAmount} hourly draw.`, {
        ...Markup.inlineKeyboard([[Markup.button.callback(`💵 Open ₦${config.hourlyAmount} Hourly`, 'cash:hourly')]]),
      });
      return;
    }
    await ctx.reply(
      `💵 *Cash / Money*\n\nPick a giveaway:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`💵 ₦${config.hourlyAmount} An Hour Giveaway`, 'cash:hourly')],
          [Markup.button.callback('🤝 Sponsored Giveaways (coming soon)', 'cash:sponsored')],
        ]),
      }
    );
  });

  bot.action('cash:sponsored', async (ctx) => {
    await ctx.answerCbQuery();
    // Sponsored = admin custom giveaways with category cash (shown if active)
    let custom = [];
    try {
      const { query } = require('./db');
      const r = await query(
        `SELECT * FROM giveaways WHERE category='cash' AND status='active' ORDER BY created_at DESC LIMIT 5`
      );
      custom = r.rows;
    } catch (_) {}
    if (!custom.length) {
      await ctx.reply('🤝 Sponsored giveaways will appear here soon. Meanwhile enter the ₦200 hourly draw!', {
        ...Markup.inlineKeyboard([[Markup.button.callback('💵 Open ₦200 Hourly', 'cash:hourly')]]),
      });
      return;
    }
    const lines = custom.map((g) => `• ${g.name} — ${prizeLabel(g)} x${g.winners_per_draw}${g.sponsored === false ? ' (Official)' : ''}`);
    await ctx.reply(`🤝 *Sponsored Giveaways*\n\n${lines.join('\n')}\n\nCustom entry flows coming next. Hourly is live now:`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('💵 Open ₦200 Hourly', 'cash:hourly')]]),
    });
  });

  bot.action('cash:hourly', async (ctx) => {
    await ctx.answerCbQuery();
    trackChat(ctx.chat && ctx.chat.id);
    const now = new Date();
    const drawId = getDrawId(now);
    const phase = getPhase(now);
    const u = ctx.from;
    await store.upsertUser(u.id, u.username, u.first_name).catch(() => {});
    await store.ensureDraw({ drawId }).catch((e) => console.error('[bot] ensureDraw', e.message));
    const count = await store.countUserTickets(drawId, u.id).catch(() => 0);
    const tickets = await store.getUserTickets(drawId, u.id).catch(() => []);

    if (phase !== 'entry_open') {
      const winners = await store.getWinners(drawId).catch(() => []);
      let extra = '';
      if (winners.length) {
        extra = `\n\n🏆 Winners:\n${winners.map((w) => `• \`${w.ticket_code}\` — ${displayWinner(w)}`).join('\n')}`;
      }
      await ctx.reply(entryPageText(drawId, phase, count, tickets) + extra, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', 'cash:hourly')]]),
      });
      return;
    }

    await ctx.reply(entryPageText(drawId, phase, count, tickets), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🎫 Get Ticket', 'ticket:get')],
        [Markup.button.callback('🔄 Refresh', 'cash:hourly')],
        [Markup.button.callback('🏆 Last Results', 'results:last')],
        [Markup.button.callback('📜 Rules', 'rules:hourly')],
      ]),
    });
  });

  bot.action('ticket:get', async (ctx) => {
    await ctx.answerCbQuery('Issuing ticket...');
    const now = new Date();
    const drawId = getDrawId(now);
    if (getPhase(now) !== 'entry_open') {
      await ctx.reply('⛔ Entry is closed right now. Winners are being picked (51–52) / results showing (53–59). Come back at the top of the hour!');
      return;
    }
    const u = ctx.from;
    await store.upsertUser(u.id, u.username, u.first_name).catch(() => {});
    await store.ensureDraw({ drawId }).catch(() => {});
    try {
      const code = await store.issueTicket(drawId, u.id, u.username);
      const count = await store.countUserTickets(drawId, u.id);
      await ctx.reply(
        `🎫 *Ticket issued!*\n\nDraw: \`${drawId}\`\nTicket: \`${code}\`\nYour tickets: ${count}/${config.maxTicketsPerUser}\n\nGood luck! 🍀`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🎫 Get Another Ticket', 'ticket:get')],
            [Markup.button.callback('📋 My Tickets', 'ticket:mine')],
          ]),
        }
      );
    } catch (e) {
      if (e.code === 'LIMIT') {
        await ctx.reply(`⛔ ${e.message}\nWait for the next hourly draw!`);
      } else {
        console.error('[bot] issueTicket', e);
        await ctx.reply('⚠️ Could not issue ticket, try again.');
      }
    }
  });

  bot.action('ticket:mine', async (ctx) => {
    await ctx.answerCbQuery();
    const drawId = getDrawId(new Date());
    const tickets = await store.getUserTickets(drawId, ctx.from.id).catch(() => []);
    if (!tickets.length) {
      await ctx.reply(`No tickets yet in draw \`${drawId}\`. Tap 🎫 Get Ticket!`, { parse_mode: 'Markdown' });
      return;
    }
    await ctx.reply(`📋 *Your tickets in ${drawId}:*\n\n${tickets.map((t) => `• \`${t}\``).join('\n')}`, {
      parse_mode: 'Markdown',
    });
  });

  bot.action('results:last', async (ctx) => {
    await ctx.answerCbQuery();
    const rows = await store.getRecentResults(5).catch(() => []);
    if (!rows.length) {
      await ctx.reply('No results yet. First draw completes at :51–:53 past the hour.');
      return;
    }
    const lines = rows.map((r) => {
      const title = r.giveaway_name || '₦200 Hourly';
      const prize = r.giveaway_prize || (r.amount > 0 ? '₦' + Number(r.amount).toLocaleString() : '');
      return r.ticket_code
        ? `• *${title}*${prize ? ` (${prize})` : ''}\n  \`${r.ticket_code}\` ${displayWinner(r)}`
        : `• ${r.id}: no entries`;
    });
    await ctx.reply(`🏆 *Recent results*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
  });

  bot.action('rules:hourly', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(`📜 *Giveaway Rules*\n\n${config.rulesText}`, { parse_mode: 'Markdown' });
  });

  bot.on('text', async (ctx) => {
    // Fallback: re-show menu for unknown text
    trackChat(ctx.chat && ctx.chat.id);
    await ctx.reply('Choose an option below:', mainMenu());
  });

  return bot;
}

// Best-effort: pin the Mini App to the chat menu button (requires the Web App
// to be registered via BotFather /newapp pointing at MINI_APP_URL).
async function setupMiniAppMenu(bot) {
  if (!config.miniAppUrl) return;
  try {
    await bot.telegram.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Play', web_app: { url: config.miniAppUrl } },
    });
    console.log('[bot] mini app menu button set.');
  } catch (e) {
    console.warn('[bot] could not set menu button (register the Web App in BotFather first):', e.message);
  }
}

module.exports = { createBot, mainMenu, setupMiniAppMenu };
