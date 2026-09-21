# NairaGiveBot 🎟️

Telegram bot that gives away money, airtime, data, gadgets, food. **Cash first:** ₦200 hourly giveaway.

Per `deen.txt` spec:
- Open bot → 4 buttons: **Enter Giveaway, How To Use App, Wallet, Contact Us**
- Enter Giveaway → categories: cash/money, airtime, data, gadgets, food, others
- Cash → two buttons: **₦200 an hour giveaway** + **Sponsored giveaways**
- Hourly: max **10 tickets** per user, draw id like `20092026A` (A=12am–1am … X=11pm–12am), ticket like `20092026A0000000001` (non-sequential random suffix)
- Schedule each hour: **:00–:50 entry, :51–:52 pick winner, :53–:59 show winning ticket + username, :00 new draw**
- Ticket page shows **sponsor name/link/bio**
- Winner picked with **seeded RNG (SHA-256 → mulberry32), never Math.random**
- **Admin dashboard** to create custom giveaways (e.g. ₦100 every 5 min for 3h; ₦100,000 ×2 winners 5/10/2026 6pm; ₦400 every 1 min for 10 min ×2 winners)
- Deploy: **Render + Neon (Postgres) + GitHub**

## Stack
Node.js + Telegraf (bot, long polling) + Express (admin) + `pg` (Neon) + `node-cron` (hourly phases). One process runs both bot and admin — fits a single free Render web service.

## Quick start (local)

1. Create bot via [@BotFather](https://t.me/BotFather) → copy token.
2. Create free DB at [neon.tech](https://neon.tech) → copy connection string.
3. `cp .env.example .env` and fill `BOT_TOKEN`, `DATABASE_URL`, `WINNER_SEED_SECRET`, `ADMIN_SECRET`.
4. `npm install`
5. `npm run migrate` (creates tables in Neon)
6. `npm start` (or `npm run dev`)
7. Open your bot in Telegram → `/start`.
8. Admin: `http://localhost:3000/admin`

Set `TZ=Africa/Lagos` so hourly windows follow Nigerian time.

## How the hourly draw works

- `getDrawId(date)` → `DDMMYYYY + A..X`. `A`=00:00–01:00, `B`=01:00–02:00, …
- Tickets: `drawId + crypto.randomInt(0..9_999_999_999)` zero-padded to 10 digits. Collision → retry. Never sequential.
- Scheduler ticks every 30s:
  - `:00–:50` → status `entry_open`, bot accepts `/ticket:get`
  - `:51–:52` → `runSeededDraw()` once (idempotent): seeded shuffle of sorted tickets, take N winners, credit `users.wallet_balance`, set status `results`
  - `:53–:59` → results shown in bot + broadcast attempt; next hour auto-creates new draw
- Seed = `SHA256(drawId|n|codes|secret)` → `mulberry32` shuffle. Deterministic, auditable, no `Math.random`.

## Admin custom giveaways

`GET /admin` dashboard, or API with `?admin_secret=...`:

- `GET /api/draws/current` — current draw, phase, count, winners
- `POST /api/draws/current/trigger` — force draw now (admin)
- `GET /api/giveaways` / `POST /api/giveaways` — create e.g.:
```json
{"name":"Evening Splash","category":"cash","amount":100000,"winners_per_draw":2,"scheduled_at":"2026-10-05T18:00:00+01:00","sponsor_name":"Acme"}
```
Interval giveaways: set `interval_minutes`, `starts_at`, `ends_at` — the scheduler worker (`tickCustom`, every 30s) auto-opens one draw per window (`G<id>-<UTC start>`, e.g. `G3-202610051800`), auto-draws each window when it closes with the same seeded shuffle (1..N winners, wallets credited), then marks the giveaway `done` after `ends_at`. One-off giveaways (`scheduled_at`, no interval) open a single draw (`G<id>-ONCE`) and draw at the scheduled time. Entry: Mini App Sponsored screen (`GET /api/miniapp/custom-open`, `POST /api/miniapp/custom-tickets`), max 10 tickets per draw like hourly.

## Deploy (GitHub → Neon → Render)

1. `git init && git add -A && git commit -m "NairaGiveBot cash hourly" && gh repo create nairagivebot --public --source=. --push`
2. Neon: new project → copy pooled connection string → `npm run migrate` locally against it.
3. Render: New → Web Service → select repo → build `npm install`, start `npm start` (or import `render.yaml` Blueprint). Add env vars: `BOT_TOKEN`, `DATABASE_URL`, `WINNER_SEED_SECRET`, `ADMIN_SECRET`, `TZ=Africa/Lagos`, `SPONSOR_*`.
4. Open `https://<your-app>.onrender.com/admin` and `/health`.

## Project layout

- `src/draw.js` — draw ids, phases, ticket gen, seeded pick (pure, tested)
- `src/store.js` — Postgres access (users/draws/tickets/winners/giveaways)
- `src/bot.js` — Telegraf handlers (4 buttons, categories, hourly entry) + Mini App buttons (`/app`, web_app)
- `src/telegramAuth.js` — Mini App `initData` validation (HMAC per Telegram docs)
- `src/miniapp.js` — authenticated Mini App API (`/api/me`, claim ticket, my tickets)
- `src/scheduler.js` — 30s cron phase machine
- `src/admin.js` — Express admin UI + API, serves `index.html` at `/`
- `src/index.js` — boots admin + bot + scheduler
- `index.html` — Mini App client (live clock, claim tickets, wallet, results)
- `migrations/schema.sql` — Neon schema
- `tests/draw.test.js` — `npm test`

## Telegram Mini App setup

1. Deploy so `index.html` has a public HTTPS URL (Render gives one), set `MINI_APP_URL` to it.
2. In [@BotFather](https://t.me/BotFather): `/newapp` → pick your bot → title `NairaGiveBot` → photo → Web App URL = `MINI_APP_URL`.
3. (Recommended) BotFather → Bot Settings → Menu Button → configure the Web App URL so the menu button opens the Mini App. The server also tries `setChatMenuButton` on boot (see `setupMiniAppMenu`).
4. Restart the bot, send `/start` → "Open Mini App" button, or send `/app`.
5. Inside Telegram the page signs you in via `initData` (`GET /api/me`), claims tickets (`POST /api/miniapp/tickets`), shows wallet + your tickets. Opened in a normal browser it is a read-only preview.

## Browser testing without Telegram (dev only)

Set `ALLOW_TEST_MODE=true` and restart. Open the page in a desktop browser, walk to the hourly ticket page and tap **Enable browser test mode** — pick a test username and the full flow works: claim tickets, wallet, win history. The client sends `X-Test-User`, which the server accepts only when test mode is on (`render.yaml` pins it to `false` in production). Use a separate dev database so test tickets never mix with real draws.

## Next steps (as spec says: cash first, rest later)
- Airtime/data/gadget/food entry flows + vendor payout hooks
- Sponsored-giveaway entry UI backed by `giveaways` table
- Interval/one-off custom-draw scheduler expansion + multi-winner broadcast
- Withdrawal flow from Wallet (OPay/bank), KYC, anti-sybil limits
