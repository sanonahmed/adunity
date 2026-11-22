# AdUnity — Telegram Mini App

A single responsive **AdUnity** app served by the website and opened in Telegram's Mini App WebView.
Ink-black canvas, champagne-gold accent, four shared sections: **Home · Ads · Referral · Profile**.
The website URL and Telegram Mini App use the same frontend build and hash-based tab routes.

This milestone includes the Mini App shell, design system, Telegram identity layer, and a server-verified referral flow backed by Neon PostgreSQL. Invite codes, first-touch attribution and a live referral dashboard — invite counts, reward points, activity and rank — are all derived from durable database rows. There is no payout ledger yet, so no money moves.

## Stack

| Component | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router) + TypeScript (strict) |
| UI | Tailwind CSS v4 + shadcn/ui conventions (`components/ui`, cva, `cn`) |
| Icons | lucide-react |
| Telegram | Telegram WebApp SDK, hand-typed wrapper (no global type package) |
| Backend | Next.js Route Handlers (`/api/auth`, `/api/referral`) |
| Auth | Server-side `initData` HMAC-SHA256 validation |
| Database | Neon PostgreSQL (`pg`) for durable referral records; configure the server-only `DATABASE_URL` |

## Run it

Requires Node.js >= 22.13 and a Neon PostgreSQL database. The referral API uses the server-only `DATABASE_URL`; it never stores production records on the app filesystem. Node 22.13+ is also used by the optional SQLite import utility.

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run start      # serve the build
```

Copy `.env.example` to `.env.local` for local development. Create a Neon project and set
`DATABASE_URL` to its pooled connection string (Neon Console → project → **Connect**);
keep it server-only, never `NEXT_PUBLIC_`. Set `TELEGRAM_BOT_TOKEN` server-side for
`POST /api/auth` and `/api/referral`; it must be the current token from BotFather.
The app creates its referral tables on first use. After creating the bot with BotFather, set
`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (required for invite links); the browser-only
**Open in Telegram** link appears as soon as the username is set (hidden inside
Telegram). Rebuild after changing `NEXT_PUBLIC_*` values.

## Structure

```
app/
  layout.tsx              root shell, metadata, SDK <Script beforeInteractive>
  page.tsx                renders <MiniApp />
  globals.css             tokens, glass/aurora/grain, motion, reduced-motion
  api/auth/route.ts       POST initData -> verified user | 401
  api/referral/route.ts   POST initData -> upsert, signed attribution, summary
components/
  miniapp/
    mini-app.tsx          client shell: tabs, hash routing, Telegram boot
    use-referral.ts       loads referral data on verified Telegram launch
    panels/referral-panel.tsx  invite link, verified counts, recent sign-ups
    tab-bar.tsx           shared bottom nav, sliding gold indicator, arrow-key support
    top-bar.tsx           shared brand bar (same website and Telegram UI)
    tabs.ts               tab definitions (single source of truth)
    brand-mark.tsx        inline SVG monogram
  ui/                     button, badge, card (shadcn conventions)
lib/
  referral.ts             shared referral code/link helpers
  referral-store-postgres.ts  Neon schema, code generation, signed attribution
  telegram.ts             typed SDK subset, version gating, init, haptics, share
  telegram-auth.ts        HMAC signature validation (server only)
  utils.ts                cn(), currency(), compactNumber(), initials()
```

## Design tokens

Defined once in `app/globals.css` under `@theme`, exposed to Tailwind utilities and
to the shadcn variable contract (`background`, `card`, `primary`, `muted`, `ring`, …).

| Token | Value |
| --- | --- |
| `--color-ink` / `--color-background` | `#06070b` |
| `--color-gold` / `--color-primary` | `#e6d2a8` |
| `--color-gold-deep` | `#bf9f6b` |
| `--color-muted-foreground` | `#99a1b0` |

Custom classes (`.glass`, `.gold-text`, `.aurora`, `.eyebrow`, `.display`, `.rise`)
live inside `@layer components`, so any Tailwind utility can still override them.
Entrance animations only set opacity/transform inside `@keyframes` — never as a base
style — so suppressed or frozen animations can never hide content.

## Behaviour

- **Telegram boot**: `ready()` → `expand()` → header/background colour set to ink →
  vertical swipes disabled. Every call is guarded; the page runs normally in a browser.
- **Identity**: name/handle come from `initDataUnsafe.user` for display only.
- **Routing**: tabs sync to the URL hash on web and Telegram. Telegram `startapp`
  parameters can open a section (`home`, `ads`, `referral`, or `profile`); browser Back
  and Telegram's native Back button follow the same in-app tab history.
- **A11y**: `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, roving `tabindex`,
  Arrow keys + Home/End, visible focus rings, `prefers-reduced-motion` respected.
- **Layout**: `viewport-fit=cover` with `env(safe-area-inset-*)`, single column capped at
  `max-w-md`, no horizontal overflow at 320px.

## Authentication

`POST /api/auth` with `{ "initData": Telegram.WebApp.initData }`:

```
secret_key        = HMAC_SHA256("WebAppData", bot_token)
data_check_string = sorted "key=value" lines, all fields except `hash`
expected_hash     = HMAC_SHA256(secret_key, data_check_string)
```

`lib/telegram-auth.ts` compares with `timingSafeEqual`, rejects payloads older than
24 hours, and parses `user` defensively. Verified responses return the Telegram user;
everything else is `401` (`bad_signature`, `expired`, `missing_hash`, `malformed_user`).

**Never** use `initDataUnsafe` to grant value — it is unsigned and editable in devtools.

## Referral flow

1. At boot the client reads `Telegram.WebApp.initData` and POSTs it to `/api/referral`.
   This happens on first paint, not when the Referral tab opens, because an invitee
   must be attributed even if they never visit that tab.
2. The route verifies the signature, then upserts the account and attributes the
   inviter from the **signed** `start_param` (`ref_<code>`). Client-supplied ids,
   codes and counts are ignored.
3. `recordVisit` runs inside one `BEGIN IMMEDIATE` transaction, so an account and its
   attribution are committed together. An account is attributed once, on the first
   launch that carries a valid code — including accounts that already existed because
   the person opened the app from the menu button earlier. `referred_telegram_id` is
   the primary key, so replays and later links cannot change the referrer.
4. The response holds that caller's code, invite count, activity buckets, reward points
   and recent sign-up timestamps; invitee names are never stored or returned.

### Reward points

Nothing is stored as a balance. Every number in the Referral tab is recomputed from
`referrals` rows on each request, so the dashboard can always be reproduced from the
database and can never drift from the real invites:

- `REFERRAL_POINTS_PER_INVITE` (default `100`) per verified invite;
- one-off milestone bonuses from `REFERRAL_MILESTONES` (3 / 5 / 10 / 25 / 50 invites);
- `REFERRAL_POINT_VALUE_USD` (default `0`, no cash estimate) optionally converts points into an estimate. Set it to `0` to show points only; displayed points have no cash value and there is no wallet or payout ledger.

Change those constants in `lib/referral.ts`; the API and the panel read the same values.
The rank tile compares this account with every other account that has invited someone.
There is still no wallet or payout ledger, so nothing is debited or paid out.

Prerequisites — the panel stays locked until these are true:

- `TELEGRAM_BOT_TOKEN` is a fresh token from @BotFather. If it is missing, both API
  routes fail closed and the panel explains that referral data is unavailable
  (`/api/referral` answers `503 server_not_configured`).
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is set, so a shareable invite link can be built:
  `https://t.me/<bot>?startapp=ref_<code>`. That form opens the bot's main Mini App and
  hands it the code as the signed `start_param`. The `https://t.me/<bot>/<short_name>`
  form is never built: it only resolves for a short name registered with BotFather
  `/newapp`, and otherwise Telegram answers "bot application not found" — every invite
  link would fail.

Referral data is unavailable in a plain browser because no verified Telegram account is attached.

## Deploying as a Mini App

1. Deploy this Next.js app to an HTTPS host (for example Vercel). Use the same deployed
   URL for the website and Telegram Mini App; Telegram requires HTTPS.
2. Create/configure the bot with `@BotFather` and set its **menu button** to the
   deployed URL: `/setmenubutton`, or `/mybots` → *Bot Settings* → *Menu Button* →
   *Configure menu button*. Telegram opens that URL as the bot's **main Mini App**,
   which is the app every invite link launches. `/newapp` is optional: it only adds a
   *named* Mini App, and the short name it returns is not used here.
3. Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (without `@`), then rebuild and deploy. The
   site's **Open in Telegram** link and every invite link
   (`https://t.me/<bot>?startapp=ref_<code>`) appear as soon as it is set.
4. In Neon, create a project and copy the **pooled** connection string from **Connect**.
   Add it to your host as the server-only `DATABASE_URL` secret (Render's `render.yaml`
   prompts for this value). Also set `TELEGRAM_BOT_TOKEN` as a server-only secret.
   Never prefix either secret with `NEXT_PUBLIC_`. The app creates its tables in Neon
   automatically; referral data is no longer stored on Render's ephemeral filesystem.

The same frontend runs in a normal browser and Telegram's WebView. Telegram-specific
capabilities (native Back button, haptics, and Telegram-provided profile identity) only
exist inside Telegram; profile identity is not simulated on the website. Deep links can
pass supported tab names with `?startapp=referral`, etc. Localhost cannot be opened as a
Telegram Mini App; use an HTTPS deployment or tunnel for Telegram testing.

`next.config.ts` sends `Content-Security-Policy: frame-ancestors` for Telegram origins;
`X-Frame-Options` has no "allow all" value and is intentionally not used.

- **Invite link shows "bot application not found"** — copy the bot's menu-button link and share it instead.
- **Your invite link is unavailable** — reopen AdUnity in Telegram and try again.
- **Your referral data isn't loading** — close and reopen AdUnity, then try refreshing your stats.
- **An invite isn't showing up** — ask the person to open your invite link. Each account is counted once.

## Production readiness

`npm run build` produces the same optimized Next.js app for the website and Telegram.
For production, set `DATABASE_URL` to the pooled Neon connection string and set
`TELEGRAM_BOT_TOKEN` as a server-only secret. The `/api/auth` route validates Telegram
`initData`; `/api/referral` persists verified invite codes and first-touch attribution in
Neon PostgreSQL, so app redeploys/restarts do not erase records. Invitees launch with
`?startapp=ref_<code>`. Reward points are computed from verified invites; campaigns and
cash payouts still need campaign data and a payout ledger.

### Move existing SQLite data and protect future data

Before the cutover, take a copy of any surviving SQLite database (include its `-wal`
and `-shm` files if the application is running). Then set `DATABASE_URL` and
`SQLITE_FILE` locally and run `npm run migrate:sqlite`. The importer opens SQLite read-only,
checks for conflicting codes/attributions, and imports users and invite relationships in
one Neon transaction; it is safe to re-run when the same rows are already present. Verify
the reported counts and the live referral dashboard before removing any old database
copy. A SQLite file lost by an earlier ephemeral-filesystem redeploy cannot be recovered
by this migration.

Neon retains database records independently of app instances, but no provider can
promise it will never restart or that data can never be lost. Configure Neon backups/
point-in-time recovery and retention for your plan, keep an independent backup, and
restrict access to `DATABASE_URL`. Free plans may suspend idle compute, so the first
request after idling can be slower; suspension/restarts do not delete stored data.

## Not built yet

- Referral fraud checks and payout ledger; referral storage now uses Neon PostgreSQL
- Campaign data and a payout ledger — reward points are computed, but nothing is paid out yet
- Localisation / `@telegram-apps/telegram-ui` migration if native chrome is preferred
