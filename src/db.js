const { Pool } = require('pg');
const config = require('./config');

let pool = null;

function getPool() {
  if (pool) return pool;
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and set Neon connection string.');
  }
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });
  pool.on('error', (err) => console.error('[db] pool error', err.message));
  return pool;
}

async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

module.exports = { getPool, query };
