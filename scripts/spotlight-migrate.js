// TEMP: migrate both DBs + spotlight on the 50k cash draw. URLs never printed.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const realUrl = fs.readFileSync(path.join(ROOT, 'deen.txt'), 'utf8').match(/postgresql:\/\/\S+/)[0];
const testUrl = realUrl.replace('/neondb?', '/neondb_test?');

(async () => {
  const schema = fs.readFileSync(path.join(ROOT, 'migrations', 'schema.sql'), 'utf8');
  for (const [name, url] of [['real', realUrl], ['test', testUrl]]) {
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query(schema);
    await c.end();
    console.log('migrated:', name);
  }
  const c = new Client({ connectionString: realUrl, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(
    `UPDATE giveaways SET spotlight = true
     WHERE category = 'cash' AND name LIKE '%50,000 Cash%' RETURNING id, name, spotlight`
  );
  console.log('spotlight on: ' + JSON.stringify(r.rows));
  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'giveaways' AND column_name = 'spotlight'`
  );
  console.log('spotlight column present:', cols.rows.length === 1);
  await c.end();
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
