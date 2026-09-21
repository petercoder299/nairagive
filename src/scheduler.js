const cron = require('node-cron');
const { getDrawId, getPhase } = require('./draw');
const custom = require('./custom');
const store = require('./store');
const config = require('./config');

let botRef = null;
let announceChatIds = new Set(); // chats that interacted (best-effort result broadcast)

function trackChat(id) {
  if (id) announceChatIds.add(String(id));
}

async function tick(now = new Date()) {
  const drawId = getDrawId(now);
  const phase = getPhase(now);
  const min = now.getMinutes();

  // Always ensure current hour draw exists
  await store.ensureDraw({ drawId });

  if (phase === 'entry_open') {
    await store.setDrawStatus(drawId, 'entry_open');
  } else if (phase === 'drawing') {
    // 12:51-12:52 window: pick winner once
    const winners = await store.getWinners(drawId);
    if (!winners.length) {
      const draw = await store.getDraw(drawId);
      if (draw && draw.status !== 'results' && draw.status !== 'closed') {
        console.log(`[scheduler] drawing ${drawId} ...`);
        await store.runSeededDraw(drawId);
      }
    }
  } else {
    // results window 12:53-12:59: ensure draw completed (in case drawing window missed)
    const draw = await store.getDraw(drawId);
    if (draw && draw.status !== 'results' && draw.status !== 'closed') {
      console.log(`[scheduler] late draw for ${drawId}`);
      await store.runSeededDraw(drawId);
    }
    // At :53 broadcast once — mark via in-memory flag per draw
    if (min === 53 && botRef) {
      await broadcastResults(drawId).catch((e) => console.error('[scheduler] broadcast failed', e.message));
    }
  }
}

function sponsorOf(g) {
  return {
    name: g.sponsor_name || config.sponsor.name,
    link: g.sponsor_link || config.sponsor.link,
    bio: g.sponsor_bio || config.sponsor.bio,
  };
}

// Custom giveaway worker: opens entry windows, draws overdue windows,
// retires finished giveaways. Runs on the same 30s cadence as hourly.
async function tickCustom(now = new Date()) {
  const giveaways = await store.getActiveGiveaways();

  for (const g of giveaways) {
    try {
      if (custom.isIntervalGiveaway(g)) {
        const win = custom.currentWindow(g, now);
        if (win) {
          await store.ensureDraw({
            drawId: custom.customDrawId(g.id, win.start),
            kind: 'custom',
            amount: g.amount,
            winnersCount: g.winners_per_draw || 1,
            giveawayId: g.id,
            sponsor: sponsorOf(g),
            entryClosesAt: win.end.toISOString(),
          });
        }
        if (g.ends_at && new Date(now).getTime() >= new Date(g.ends_at).getTime()) {
          await store.markGiveawayDone(g.id);
          console.log(`[scheduler] custom giveaway #${g.id} finished.`);
        }
      } else if (custom.isOneOffGiveaway(g)) {
        const state = custom.oneOffState(g, now);
        const drawId = custom.oneOffDrawId(g.id);
        await store.ensureDraw({
          drawId,
          kind: 'custom',
          amount: g.amount,
          winnersCount: g.winners_per_draw || 1,
          giveawayId: g.id,
          sponsor: sponsorOf(g),
          entryClosesAt: new Date(g.scheduled_at).toISOString(),
        });
        if (state === 'due') {
          console.log(`[scheduler] one-off custom giveaway #${g.id} due — drawing ${drawId} ...`);
          await store.runSeededDraw(drawId);
          await store.markGiveawayDone(g.id);
        }
      }
      // else: misconfigured (no interval, no scheduled_at) — leave for admin to fix.
    } catch (e) {
      console.error(`[scheduler] custom giveaway #${g.id} failed:`, e.message);
    }
  }

  // Close any entry windows whose time passed (interval windows + late one-offs).
  const overdue = await store.getOverdueCustomDraws(now);
  for (const d of overdue) {
    try {
      console.log(`[scheduler] closing overdue custom draw ${d.id} ...`);
      await store.runSeededDraw(d.id);
    } catch (e) {
      console.error(`[scheduler] overdue draw ${d.id} failed:`, e.message);
    }
  }
}
const broadcasted = new Set();
async function broadcastResults(drawId) {
  if (broadcasted.has(drawId)) return;
  broadcasted.add(drawId);
  const winners = await store.getWinners(drawId);
  const draw = await store.getDraw(drawId);
  let text;
  if (!winners.length) {
    text = `⏰ Draw ${drawId} (₦${draw ? draw.amount : config.hourlyAmount}) closed with no entries. New draw opens at the next hour!`;
  } else {
    const lines = winners.map(
      (w, i) => `${i + 1}. 🎟️ \`${w.ticket_code}\` — @${w.username || w.telegram_id} (+₦${w.prize_amount})`
    );
    text = `🏆 *Draw ${drawId} result*\n\n${lines.join('\n')}\n\nNew draw opens at the next hour. Good luck!`;
  }
  for (const chatId of announceChatIds) {
    try {
      await botRef.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (_) {
      // ignore blocked/left chats
    }
  }
}

function startScheduler(bot) {
  botRef = bot || null;
  // Every 30 seconds to hit :51/:53 windows reliably
  cron.schedule('*/30 * * * * *', () => {
    tick(new Date()).catch((e) => console.error('[scheduler] tick failed', e.message));
    tickCustom(new Date()).catch((e) => console.error('[scheduler] custom tick failed', e.message));
  });
  // Immediate tick on boot
  tick(new Date()).catch((e) => console.error('[scheduler] boot tick failed', e.message));
  tickCustom(new Date()).catch((e) => console.error('[scheduler] boot custom tick failed', e.message));
  console.log('[scheduler] started (every 30s, Africa/Lagos time via TZ env).');
}

module.exports = { startScheduler, tick, tickCustom, trackChat };
