-- Neon (Postgres) schema for NairaGiveBot
-- Run with: npm run migrate  (uses DATABASE_URL)

CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  wallet_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generic draws table. Hourly 200-naira draws use kind='hourly_200', id like '20092026A'.
-- Admin custom giveaways also create rows here with kind='custom'.
CREATE TABLE IF NOT EXISTS draws (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'hourly_200',
  giveaway_id INTEGER,
  amount INTEGER NOT NULL DEFAULT 200,
  winners_count INTEGER NOT NULL DEFAULT 1,
  hour_started_at TIMESTAMPTZ,
  entry_closes_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'entry_open',
  sponsor_name TEXT,
  sponsor_link TEXT,
  sponsor_bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drawn_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tickets (
  ticket_code TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_draw ON tickets(draw_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_draw ON tickets(draw_id, telegram_id);

-- Supports 1..N winners per draw (hourly = 1, custom e.g. 2 winners)
CREATE TABLE IF NOT EXISTS draw_winners (
  draw_id TEXT NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  ticket_code TEXT NOT NULL REFERENCES tickets(ticket_code) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  username TEXT,
  prize_amount INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (draw_id, ticket_code)
);

-- Admin-created giveaway templates / schedules
CREATE TABLE IF NOT EXISTS giveaways (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'cash',
  amount INTEGER NOT NULL,
  winners_per_draw INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  sponsor_name TEXT,
  sponsor_link TEXT,
  sponsor_bio TEXT,
  rules TEXT,
  draw_prefix TEXT,
  ticket_digits INTEGER NOT NULL DEFAULT 10,
  sponsored BOOLEAN NOT NULL DEFAULT true,
  draw_seq INTEGER,
  spotlight BOOLEAN NOT NULL DEFAULT false,
  prize_text TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade for databases created before the rules column existed.
-- Safe to re-run: IF NOT EXISTS. (npm run migrate runs this whole file.)
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS rules TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS draw_prefix TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS ticket_digits INTEGER NOT NULL DEFAULT 10;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS sponsored BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS draw_seq INTEGER;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS spotlight BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS prize_text TEXT;

-- User withdrawal requests (min ₦100, paid out manually by admin)
CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  username TEXT,
  full_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(telegram_id);
