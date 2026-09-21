const config = require('./config');
const { createBot, setupMiniAppMenu } = require('./bot');
const { createAdminApp } = require('./admin');
const { startScheduler } = require('./scheduler');

async function main() {
  // Admin dashboard (Render web service needs a listening port)
  const app = createAdminApp();
  app.listen(config.port, () => console.log(`[admin] listening on :${config.port} (GET /admin)`));

  // Telegram bot (long polling — no public webhook needed; works on Render background/web service)
  if (!config.botToken) {
    console.warn('[bot] BOT_TOKEN not set — bot disabled, admin only.');
    return;
  }
  const bot = createBot();
  startScheduler(bot);
  await bot.launch();
  console.log('[bot] launched (long polling).');
  await setupMiniAppMenu(bot);

  const stop = async (sig) => {
    console.log(`[index] ${sig} — stopping...`);
    try {
      bot.stop(sig);
    } catch (_) {}
    process.exit(0);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}

main().catch((e) => {
  console.error('[index] fatal:', e);
  process.exit(1);
});
