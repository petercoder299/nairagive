require('dotenv').config();

function requireEnv(name, fallback = undefined) {
  const v = process.env[name] ?? fallback;
  return v;
}

const config = {
  botToken: requireEnv('BOT_TOKEN', ''),
  databaseUrl: requireEnv('DATABASE_URL', ''),
  port: parseInt(requireEnv('PORT', '3000'), 10),
  timezone: requireEnv('TIMEZONE', 'Africa/Lagos'),
  winnerSeedSecret: requireEnv('WINNER_SEED_SECRET', 'nairagivebot-default-seed-change-me'),
  adminSecret: requireEnv('ADMIN_SECRET', 'change-me-admin-secret'),
  miniAppUrl: requireEnv('MINI_APP_URL', ''),
  // DEV ONLY. When true, Mini App APIs accept X-Test-User so index.html
  // works fully in a desktop browser without Telegram. Never enable in prod.
  allowTestMode: requireEnv('ALLOW_TEST_MODE', 'false') === 'true',
  hourlyAmount: parseInt(requireEnv('HOURLY_AMOUNT', '200'), 10),
  // Master switch for the hardcoded hourly draw. Set false to run ONLY
  // admin-created giveaways (hourly stops opening, drawing and accepting).
  hourlyEnabled: requireEnv('HOURLY_ENABLED', 'true') === 'true',
  // Prefix for hourly draw IDs, e.g. NG0122092026A. Empty = legacy DDMMYYYY+letter.
  hourlyPrefix: requireEnv('HOURLY_PREFIX', 'NG'),
  maxTicketsPerUser: parseInt(requireEnv('MAX_TICKETS_PER_USER', '10'), 10),
  withdrawMin: parseInt(requireEnv('WITHDRAW_MIN', '100'), 10),
  // Monetag rewarded postback key. Empty = accept all (testing only).
  monetagPostbackKey: requireEnv('MONETAG_POSTBACK_KEY', ''),
  sponsor: {
    name: requireEnv('SPONSOR_NAME', 'NaijaGiveawayBot'),
    link: requireEnv('SPONSOR_LINK', 'https://t.me/naijagiveawaybot'),
    bio: requireEnv('SPONSOR_BIO', 'Proudly powering free hourly ₦200 giveaways for our community.'),
  },
  contact: {
    text: requireEnv(
      'CONTACT_TEXT',
      'If you want to claim your prize, you got questions or you want to host a giveaway on our app? Contact @ponyed838 on telegram.'
    ),
  },
  howToUse: requireEnv(
    'HOW_TO_USE_TEXT',
    'HOW TO USE\n\n1. Tap Enter Giveaway\n2. Pick a category (start with Cash/Money)\n3. Pick "₦200 Hourly Giveaway"\n4. Tap "Enter Lucky Draw" (max 10 tickets per hour)\n5. Entry open :00-:50 each hour. Winner picked :51-:52. Result shown :53-:59.\n6. Winnings go to Wallet.'
  ),
  rulesText: requireEnv(
    'RULES_TEXT',
    'GIVEAWAY RULES\n\n1. Entry is free. Max 10 tickets per user per draw.\n2. Hourly draw: entry :00–:50, winner picked :51–:52, results :53–:59 (Africa/Lagos).\n3. One winner per hourly draw; custom draws pay the stated winners.\n4. Winners are picked by seeded shuffle (SHA-256), never at random by hand.\n5. Winnings credit to your Wallet automatically. No ticket, no win.\n6. Abuse, duplicate accounts or botting forfeits winnings.'
  ),
};

module.exports = config;
