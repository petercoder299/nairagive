# NairaGiveBot — Features

Telegram Mini App + bot for hourly and custom giveaways (cash first,
airtime/data/gadgets/food/others next).

## Entry flows (deen.txt)
- Home → 4 buttons: Enter Giveaway, How To Use App, Wallet, Contact Us.
- Enter Giveaway → categories (live count is server-driven, never hardcoded).
- Cash → spotlight strip (auto-slides every 20s) + Naira Giveaways (Win Cash Daily) + Sponsored Cash Giveaways.
- Naira list: ₦200 hourly row + official cash draws → full entry pages.
- Others/Food/Gadgets lists → full entry pages per giveaway.
- Every ticket page: live countdown, claim button, paged entries (20/page),
  winners with gold-coin reveal, sponsor block, rules, closes date.

## Draws
- ₦200 hourly: entry :00–:50, draw :51–:52, results :53–:59 (Africa/Lagos).
  IDs like `20092026A` legacy or `NG0122092026A` with `HOURLY_PREFIX=NG`.
  Kill-switchable via `HOURLY_ENABLED=false`.
- Custom draws: interval windows (`G7-202610051800`) or one-offs, plus
  prefixed families: `OG` (others), `FD` (food), `GAD`, `AT`, `DBUN`,
  `SCG`, `CASH` — PREFIX + sequence + date + creation-hour letter.
- Tickets: draw/entry-stamped prefix + 10 non-sequential crypto-random
  digits (configurable per giveaway). Max 10 per user per calendar hour.
- Winners: seeded SHA-256 shuffle, 1..N winners, idempotent. Winner
  identity shows @username → telegram ID → profile name, prefixed `Winner:`.

## Money
- Wallet holds cash winnings only (engine-enforced). Balance pill, win
  history (10/page, ticket + giveaway + prize + date + winner).
- Withdrawals: min ₦100, 10–16 digit NUBAN validation, balance debited
  atomically, admin pays manually or rejects (auto-refund). Request
  history, 10/page.
- Admin manual top-up/deduct by telegram numeric ID.

## Giveaway management (`/admin`, secret-gated)
- Login gate + session + logout. Stat cards, withdrawals queue with
  Paid/Reject, giveaway create (all fields incl. rules, prefix, digits,
  sponsored flag, spotlight flag, prize text), per-row sponsor edit,
  spotlight ★ toggle, stop, draws list + manual trigger, top-up,
  Monetag ad-events view.

## Engagement
- Sponsored vs Official differentiation (Official rows hide sponsors).
- Per-giveaway rules pages; About Sponsor pages (location, phone,
  website, X/Facebook/Instagram/LinkedIn).
- Cash spotlight strip (unlimited, per-giveaway opt-in flag).
- Weekly leaderboard (Mon–Sun Lagos): top 10 by tickets, 24h trend
  arrows, ₦5,000/₦3,000/₦2,000 prizes + previous winners board.
- Monetag rewarded interstitials before the 4th/7th/9th ticket in
  CASH/NG/SCG draws (ymid + placement tracked; ticket always issued;
  server postback verification with replay protection).

## Ops
- One Render web service runs bot (long polling) + API + scheduler.
- Auto-migrate on boot; free-tier sleep tolerated everywhere.
- Browser test mode (`ALLOW_TEST_MODE`, dev only) for testing without Telegram.
- Seeded, deterministic, auditable draws; 60+ automated tests.
