# NairaGiveBot — Free Setup Guide (GitHub + Neon + Render)

Run the whole stack for **₦0**: code on GitHub (free), Postgres on Neon (free tier),
backend + Mini App on Render (free tier), bot on Telegram (free).

Total time: ~30 minutes if you already have the accounts, ~1 hour from scratch.

---

## 0. What you need

| Account | Cost | Used for |
|---|---|---|
| [GitHub](https://github.com) | free | hosting the code |
| [Neon](https://neon.tech) | free tier (1 project) | Postgres database |
| [Render](https://render.com) | free tier (web service) | running bot + Mini App + admin |
| Telegram + [@BotFather](https://t.me/BotFather) | free | the bot + Mini App entry point |

On your machine you need: [Node.js 18+](https://nodejs.org) and [git](https://git-scm.com).

> Keep this repo's layout as-is: `src/` (bot + server), `index.html` (Mini App,
> served at `/`), `migrations/schema.sql`, `render.yaml` (Render blueprint),
> `.env.example` (all settings documented).

---

## 1. Test locally first (free, 5 minutes)

Nothing here costs money or needs an account.

```powershell
cd C:\Users\ASL STUDIOS\Desktop\nairagivebot
npm install
npm test        # 23 checks — all must PASS
```

Copy the settings template and fill in dev values:

```powershell
copy .env.example .env
```

For local play, `.env` needs at minimum:

```
PORT=3000
ALLOW_TEST_MODE=true
```

(`BOT_TOKEN` empty = bot chat stays off, page + APIs still run. `DATABASE_URL`
empty = reads degrade gracefully; claiming needs a database — step 3.)

```powershell
npm start
```

Open http://localhost:3000 — walk Home → Enter Giveaway → Cash → ₦200 Hourly →
**Demo draw** for a full simulated cycle. To test real claiming in a desktop
browser, tap **Enable browser test mode** (works because `ALLOW_TEST_MODE=true`).

> Never commit `.env` — `.gitignore` already excludes it.

---

## 2. Put the code on GitHub (free)

1. Create a free account at https://github.com and a **new public repository**,
   e.g. `nairagivebot`. Do NOT tick "Add a README" (this folder already has one).
2. Push this folder (run inside `nairagivebot\`):

```powershell
git init
git add .
git commit -m "NairaGiveBot cash hourly + custom scheduler"
git branch -M main
git remote add origin https://github.com/YOURNAME/nairagivebot.git
git push -u origin main
```

3. Confirm on github.com that `src/`, `index.html`, `render.yaml` and
   `migrations/schema.sql` are there — and that `.env` is NOT.

---

## 3. Free Postgres on Neon (free tier)

1. Sign up at https://neon.tech → **New Project** → name it `nairagivebot` →
   pick the region closest to Nigeria/Europe → Create.
2. On the project dashboard, copy the **connection string** (it looks like
   `postgresql://user:pass@ep-xxxx.neon.tech/dbname?sslmode=require`).
   Use the **pooled** connection string if offered (handles Render's connections better).
3. Create the tables from your machine (one command, uses `DATABASE_URL`):

```powershell
$env:DATABASE_URL="postgresql://user:pass@ep-xxxx.neon.tech/dbname?sslmode=require"
npm run migrate
```

You should see `[migrate] done.` Tables created: `users`, `draws`, `tickets`,
`draw_winners`, `giveaways`.

> Free-tier note: Neon free projects sleep when idle and have storage/usage
> limits — plenty for starting out. If the first request after idle is slow,
> that is Neon waking up, not a bug.

---

## 4. Free backend on Render (free tier)

### Option A — Blueprint (fastest)

1. Sign up at https://render.com → **New → Blueprint** → connect your
   `nairagivebot` GitHub repo. Render reads `render.yaml` automatically:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free**
2. Render will ask for the `sync: false` values — fill them in:
   | Key | Value |
   |---|---|
   | `BOT_TOKEN` | token from `@BotFather` (step 5) — you can add it after |
   | `DATABASE_URL` | Neon connection string from step 3 |
   | `WINNER_SEED_SECRET` | long random string (generate: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`) |
   | `ADMIN_SECRET` | another long random string (admin dashboard password) |
   | `MINI_APP_URL` | your Render URL, e.g. `https://nairagivebot.onrender.com/` (add after first deploy, then redeploy) |
3. Deploy. Open `https://YOUR-APP.onrender.com/health` → `{"ok":true,...}`.

### Option B — manual Web Service

Same values by hand: **New → Web Service** → connect repo → Runtime `Node` →
Build `npm install` → Start `npm start` → Free plan → add the Environment
variables from the table above (`TZ=Africa/Lagos`, `ALLOW_TEST_MODE=false`,
`HOURLY_AMOUNT=200`, `MAX_TICKETS_PER_USER=10`, `SPONSOR_*` as in `render.yaml`).

> Free-tier notes:
> - Free web services **sleep after ~15 min idle**. First request after sleep
>   takes ~60s. The Mini App shows its offline state meanwhile and recovers.
> - `ALLOW_TEST_MODE` must be **`false`** in production — otherwise anyone can
>   impersonate any user via the `X-Test-User` header.
> - Keep `WINNER_SEED_SECRET` secret — anyone who knows it can predict draws.

---

## 5. Wire the Telegram bot + Mini App (free)

1. Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → name it →
   copy the token into Render's `BOT_TOKEN` (auto-redeploys).
2. Still in BotFather: `/newapp` → choose your bot → title `NairaGiveBot` →
   upload any square photo → Web App URL = `https://YOUR-APP.onrender.com/`.
3. (Recommended) BotFather → Bot Settings → Menu Button → set it to your Web
   App URL. The server also calls `setChatMenuButton` on boot.
4. Open your bot → `/start` → **Open Mini App** (or `/app`). Inside Telegram
   you are signed in automatically — claim tickets, wallet, results all work.

---

## 6. Verify production end-to-end

1. `https://YOUR-APP.onrender.com/health` → ok.
2. `https://YOUR-APP.onrender.com/admin` → dashboard loads.
3. In `/admin` → **Create custom giveaway**: amount `1`, winners `1`,
   interval `1`, starts now, ends now + 10 min → appears in the Mini App
   **Sponsored** screen within ~30s with a live **Enter** button.
4. Enter from two test accounts (or test mode off + real Telegram users),
   wait ~2 min, confirm winners post, wallets credit, giveaway flips to `done`.
5. Delete the test giveaway's draws if you like (`PATCH /api/giveaways/:id`
   with `{"status":"cancelled"}`), or leave it — `done` giveaways stop by themselves.

---

## 7. Switching cheat-sheet

| What | Local TEST | Production LIVE |
|---|---|---|
| `.env` / Render env | `ALLOW_TEST_MODE=true`, no secrets needed | `ALLOW_TEST_MODE=false`, all secrets set |
| Database | none (reads degrade) or a Neon dev branch | Neon pooled connection string |
| Mini App auth | **Enable browser test mode** button | Telegram `initData`, automatic |
| Draw secret | default ok | unique `WINNER_SEED_SECRET`, secret |
| `MINI_APP_URL` | `http://localhost:3000/` | `https://YOUR-APP.onrender.com/` |

---

## 8. Troubleshooting

- **Page shows "Offline"** — server asleep (free tier, wait ~60s and refresh)
  or `DATABASE_URL` wrong. Check Render → Logs.
- **`/api/me` 401 in Telegram** — `BOT_TOKEN` on Render doesn't match the bot
  that opened the app. Re-check BotFather token vs env var.
- **No winners drawn** — scheduler runs every 30s; interval windows close only
  after `entry_closes_at` passes. Check Render logs for `[scheduler]` lines.
- **Admin 401** — append `?admin_secret=YOUR_ADMIN_SECRET` to the `/admin` URL.
- **Wrong hour windows** — `TZ=Africa/Lagos` must be set on Render (hourly
  draws follow server local time).
- **Custom giveaway never opens** — needs `status=active` plus either
  (`interval_minutes` + `starts_at` + `ends_at`) or `scheduled_at`.
  Anything else is skipped as misconfigured (see Render logs).

---

## 9. Going further (all still free)

- **Custom domain**: Render → Settings → Custom Domain (needs a domain you own).
- **Uptime**: a free external pinger (e.g. UptimeRobot) hitting `/health` every
  5 minutes keeps the free service warm.
- **Backups**: Neon free tier includes point-in-time recovery window — check
  your project's Storage settings.
- **Separate dev database**: create a second Neon branch for testing so test
  tickets never mix with real draws.
