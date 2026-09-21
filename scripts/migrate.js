const fs = require('fs');
const path = require('path');
const { getPool } = require('../src/db');

async function main() {
  const pool = getPool();
  const sqlPath = path.join(__dirname, '..', 'migrations', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('[migrate] running schema.sql ...');
  await pool.query(sql);
  console.log('[migrate] done.');
  await pool.end();
}

main().catch((e) => {
  console.error('[migrate] failed:', e.message);
  process.exit(1);
});
