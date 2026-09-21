// TEMP: delete Cactus giveaway + all its draws/tickets, recreate fresh.
// URLs never printed.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const custom = require('../src/custom');

const ROOT = path.join(__dirname, '..');
const realUrl = fs.readFileSync(path.join(ROOT, 'deen.txt'), 'utf8').match(/postgresql:\/\/\S+/)[0];

const FOOD = {
  name: '₦50,000 Food Credit at Cactus Restaurant',
  category: 'food',
  amount: 0,
  winners_per_draw: 1,
  interval_minutes: null,
  starts_at: null,
  ends_at: null,
  scheduled_at: '2026-10-11T18:00:00+01:00',
  sponsor_name: 'Cactus Restaurant',
  sponsor_link: null,
  sponsor_bio:
    'Cactus Restaurant, Victoria Island, Lagos is treating one lucky winner to ₦50,000 in food credit. Dine in and enjoy, on the house.',
  rules:
    'CACTUS FOOD GIVEAWAY RULES\n\n1. Entry is free. Max 10 tickets per hour.\n2. Entry closes 11 October 2026, 6:00pm WAT; one winner picked the same minute by seeded shuffle.\n3. Prize: ₦50,000 food credit redeemable at Cactus Restaurant, Victoria Island, Lagos.\n4. Winner must claim within 48 hours or a redraw happens.\n5. Dine-in only, one redemption; abuse forfeits the prize.',
  draw_prefix: 'FD',
  ticket_digits: 10,
};

(async () => {
  const c = new Client({ connectionString: realUrl, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const old = await c.query(
    `SELECT d.id, d.status, (SELECT COUNT(*) FROM tickets t WHERE t.draw_id = d.id) AS tickets,
            (SELECT COUNT(*) FROM draw_winners w WHERE w.draw_id = d.id) AS winners
     FROM draws d JOIN giveaways g ON g.id = d.giveaway_id
     WHERE g.category = 'food' AND g.name = $1`,
    [FOOD.name]
  );
  console.log('old food draws: ' + JSON.stringify(old.rows));

  const delD = await c.query(
    `DELETE FROM draws WHERE giveaway_id IN (SELECT id FROM giveaways WHERE name = $1 AND category = 'food') RETURNING id`,
    [FOOD.name]
  );
  console.log('deleted draws: ' + (delD.rows.map((r) => r.id).join(', ') || 'none'));

  const delG = await c.query(
    `DELETE FROM giveaways WHERE name = $1 AND category = 'food' RETURNING id`,
    [FOOD.name]
  );
  console.log('deleted giveaway rows: ' + JSON.stringify(delG.rows));

  const r = await c.query(
    `INSERT INTO giveaways (name, category, amount, winners_per_draw, interval_minutes, starts_at, ends_at, scheduled_at, sponsor_name, sponsor_link, sponsor_bio, rules, draw_prefix, ticket_digits, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active') RETURNING *`,
    [FOOD.name, FOOD.category, FOOD.amount, FOOD.winners_per_draw, FOOD.interval_minutes, FOOD.starts_at, FOOD.ends_at, FOOD.scheduled_at, FOOD.sponsor_name, FOOD.sponsor_link, FOOD.sponsor_bio, FOOD.rules, FOOD.draw_prefix, FOOD.ticket_digits]
  );
  const row = r.rows[0];
  console.log('new food: id=' + row.id + ' draw=' + custom.oneOffDrawId(row) + ' closes=' + row.scheduled_at);
  await c.end();
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
