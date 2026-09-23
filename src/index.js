const config = require('./config');
const { createBot, setupMiniAppMenu } = require('./bot');
const { createAdminApp } = require('./admin');
const { startScheduler } = require('./scheduler');

async function main() {
  // Fresh databases start empty — apply the (idempotent) schema on every
  // boot so Render deploys work with zero manual steps. Never fatal.
  await autoMigrate();

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

async function autoMigrate() {
  if (!config.databaseUrl) {
    console.warn('[db] DATABASE_URL not set — skipping auto-migrate.');
    return;
  }
  try {
    const fs = require('fs');
    const path = require('path');
    const { query } = require('./db');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'schema.sql'), 'utf8');
    await query(sql);
    console.log('[db] schema ready.');
  } catch (e) {
    console.error('[db] auto-migrate failed (will retry next boot):', e.message);
  }
}
