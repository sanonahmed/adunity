# AdUnity — Telegram Mini App

A single responsive **AdUnity** app served by the website and opened in Telegram's Mini App WebView.
Ink-black canvas, champagne-gold accent, four shared sections: **Home · Ads · Referral · Profile**.
The website URL and Telegram Mini App use the same frontend build and hash-based tab routes.

This milestone includes the Mini App shell, design system, Telegram identity layer, and a server-verified referral flow backed by SQLite. Referral invite codes and first-touch attribution are persisted; earnings and payouts remain unavailable because no reward policy is configured.

## Stack

| Component | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router) + TypeScript (strict) |
| UI | Tailwind CSS v4 + shadcn/ui conventions (`components/ui`, cva, `cn`) |
| Icons | lucide-react |
| Telegram | Telegram WebApp SDK, hand-typed wrapper (no global type package) |
| Backend | Next.js Route Handlers (`/api/auth`, `/api/referral`) |
| Auth | Server-side `initData` HMAC-SHA256 validation |
| Database | Node.js built-in SQLite (`node:sqlite`) for referral records; configure `ADUNITY_DB_PATH` to a persistent writable disk |

## Run it

Requires Node.js >= 22.13 (for the built-in `node:sqlite` database). Referral records live in `.data/adunity.sqlite` by default; use `ADUNITY_DB_PATH` to point at a persistent writable file.

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run start      # serve the build
```

Copy `.env.example` to `.env.local` before deploying. Set `TELEGRAM_BOT_TOKEN`
server-side for `POST /api/auth` and `/api/referral`; it must be the current token
from BotFather and must never use a `NEXT_PUBLIC_` prefix. Set `ADUNITY_DB_PATH` to a
persistent writable SQLite file in production (otherwise the default `.data` path is
used). After creating a Telegram bot/Mini App with BotFather, set
`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (required for invite links) and optionally
`NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME`; the browser-only **Open in Telegram** link
appears as soon as the username is set (hidden inside Telegram). Rebuild after changing
`NEXT_PUBLIC_*` values.

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
  referral-store.ts       SQLite schema, code generation, signed attribution
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
   attribution are committed together and first-touch wins on replay.
4. The response holds only that caller's code, verified invite count and recent
   sign-up timestamps; invitee names are never stored or returned.

Prerequisites — the panel stays locked until these are true:

- `TELEGRAM_BOT_TOKEN` is a fresh token from @BotFather. If it is missing, both API
  routes fail closed and the panel explains that referral data is unavailable
  (`/api/referral` answers `503 server_not_configured`).
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is set, so a shareable invite link can be built.
  `NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME` is optional: with it the link is
  `https://t.me/<bot>/<app>?startapp=ref_<code>`, without it the bot's main Mini App is
  addressed as `https://t.me/<bot>?startapp=ref_<code>`. Both forms pass the value to
  the Mini App as the signed `start_param`.

Referral data is deliberately unavailable in a plain browser: there is no signed
Telegram launch, so there is no trustworthy identity to attach a code to.

## Deploying as a Mini App

1. Deploy this Next.js app to an HTTPS host (for example Vercel). Use the same deployed
   URL for the website and Telegram Mini App; Telegram requires HTTPS.
2. Create/configure a bot with `@BotFather`, then create its Mini App with `/newapp`
   and set the deployed site URL. BotFather supplies the Mini App short name.
3. Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (without `@`) — and, if you created a named
   Mini App with `/newapp`, `NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME` — then rebuild and
   deploy. The site's **Open in Telegram** link and referral invite links appear as soon
   as the bot username is set.
4. Configure the bot menu button in BotFather to open the same Mini App. Set
   `TELEGRAM_BOT_TOKEN` as a server-only host secret to enable `POST /api/auth` and `/api/referral`. Set `ADUNITY_DB_PATH` to a persistent writable SQLite file; ephemeral serverless filesystems cannot persist referral records.

The same frontend runs in a normal browser and Telegram's WebView. Telegram-specific
capabilities (native Back button, haptics, and Telegram-provided profile identity) only
exist inside Telegram; profile identity is not simulated on the website. Deep links can
pass supported tab names with `?startapp=referral`, etc. Localhost cannot be opened as a
Telegram Mini App; use an HTTPS deployment or tunnel for Telegram testing.

`next.config.ts` sends `Content-Security-Policy: frame-ancestors` for Telegram origins;
`X-Frame-Options` has no "allow all" value and is intentionally not used.

## Production readiness

`npm run build` produces the same optimized Next.js app for the website and Telegram.
For a Telegram launch, deploy it to HTTPS, configure the BotFather Mini App URL and
short name, and provide `TELEGRAM_BOT_TOKEN` as a fresh server-only BotFather secret. The `/api/auth` route validates Telegram `initData`; `/api/referral` additionally persists verified invite codes and first-touch attribution in SQLite. Set `ADUNITY_DB_PATH` to a durable writable volume in production: ephemeral serverless filesystems lose referral records after restart. Invitees launch with `?startapp=ref_<code>`. Real campaigns, earnings, and payouts remain unavailable until reward policy and payout accounting are configured.

## Not built yet

- Production-grade Postgres migration and referral fraud checks; the current SQLite store needs a persistent volume
- Real campaigns, reward crediting and a payout ledger
- Localisation / `@telegram-apps/telegram-ui` migration if native chrome is preferred
