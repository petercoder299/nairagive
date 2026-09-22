// TEMP: run worker cleanup tick + create 4 DRAFT giveaways (AT/DBUN/GAD/SCG).
// Drafts are invisible until admin sets schedule + flips to active.
// URLs never printed.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const realUrl = fs.readFileSync(path.join(ROOT, 'deen.txt'), 'utf8').match(/postgresql:\/\/\S+/)[0];
process.env.DATABASE_URL = realUrl;

const DRAFTS = [
  { name: 'Airtime Giveaway', category: 'airtime', prefix: 'AT', sponsored: true },
  { name: 'Data Bundle Giveaway', category: 'data', prefix: 'DBUN', sponsored: true },
  { name: 'Gadget Giveaway', category: 'gadgets', prefix: 'GAD', sponsored: true },
  { name: 'Sponsored Cash Giveaway', category: 'cash', prefix: 'SCG', sponsored: true },
];

(async () => {
  delete require.cache[require.resolve('../src/db')];
  const { tickCustom } = require('../src/scheduler');
  await tickCustom(new Date());
  console.log('worker tick done (stale draws closed/drawn, finished retired)');

  const { Client } = require('pg');
  const c = new Client({ connectionString: realUrl, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const d of DRAFTS) {
    const existing = await c.query(`SELECT id, status FROM giveaways WHERE draw_prefix = $1 ORDER BY id`, [d.prefix]);
    if (existing.rows.length) {
      console.log(d.prefix + ' exists: ' + JSON.stringify(existing.rows));
      continue;
    }
    const r = await c.query(
      `INSERT INTO giveaways (name, category, amount, winners_per_draw, interval_minutes, starts_at, ends_at, scheduled_at, sponsor_name, sponsor_link, sponsor_bio, rules, draw_prefix, ticket_digits, sponsored, draw_seq, spotlight, prize_text, status)
       VALUES ($1,$2,0,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Details coming soon — set prize, schedule and sponsor in /admin, then flip to active.',$4,10,$3,1,false,NULL,'draft') RETURNING id`,
      [d.name, d.category, d.sponsored, d.prefix]
    );
    console.log('draft created: ' + d.prefix + ' id=' + r.rows[0].id);
  }
  await c.end();
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
