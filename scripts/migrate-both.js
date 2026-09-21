// TEMP: apply migrations/schema.sql to BOTH databases. URLs never printed.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const txt = fs.readFileSync(path.join(ROOT, 'deen.txt'), 'utf8');
const m = txt.match(/postgresql:\/\/\S+/);
if (!m) {
  console.log('NO_CONNECTION_STRING');
  process.exit(1);
}
const realUrl = m[0];
const testUrl = realUrl.replace('/neondb?', '/neondb_test?');

(async () => {
  const schema = fs.readFileSync(path.join(ROOT, 'migrations', 'schema.sql'), 'utf8');
  for (const [name, url] of [['real(neondb)', realUrl], ['test(neondb_test)', testUrl]]) {
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query(schema);
    await c.end();
    console.log('migrated:', name);
  }
  const verify = new Client({ connectionString: testUrl, ssl: { rejectUnauthorized: false } });
  await verify.connect();
  const r = await verify.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'giveaways' AND column_name = 'rules'`
  );
  await verify.end();
  console.log('rules column present:', r.rows.length === 1);
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
