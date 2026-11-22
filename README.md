# AdUnity — Telegram Mini App

A single responsive **AdUnity** app served by the website and opened in Telegram's Mini App WebView.
Ink-black canvas, champagne-gold accent, four shared sections: **Home · Ads · Referral · Profile**.
The website URL and Telegram Mini App use the same frontend build and hash-based tab routes.

This milestone includes the Mini App shell, design system and Telegram identity layer.
**Ads** and **Profile** are not connected to backend data. The **Referral** section reports
that referral data is unavailable: referral persistence, attribution and a server-issued
invite code are not implemented. It deliberately displays no referral counts,
earnings, rates, invite links or user records until verified data is available.

## Stack

| Component | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router) + TypeScript (strict) |
| UI | Tailwind CSS v4 + shadcn/ui conventions (`components/ui`, cva, `cn`) |
| Icons | lucide-react |
| Telegram | Telegram WebApp SDK, hand-typed wrapper (no global type package) |
| Backend | Next.js Route Handlers (`/api/auth`) |
| Auth | Server-side `initData` HMAC-SHA256 validation |
| Database | Neon + Drizzle ORM — **not wired yet** (no schema for these screens) |

## Run it

Requires Node.js >= 20.9 (the minimum for Next.js 16).

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run start      # serve the build
```

Copy `.env.example` to `.env.local` before deploying. Set `TELEGRAM_BOT_TOKEN`
server-side for `POST /api/auth`. After creating a Telegram Mini App with BotFather,
set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` and `NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME`
to show the website's **Open in Telegram** link. Rebuild after changing `NEXT_PUBLIC_*`
values. Never expose `TELEGRAM_BOT_TOKEN` with a `NEXT_PUBLIC_` prefix.

## Structure

```
app/
  layout.tsx              root shell, metadata, SDK <Script beforeInteractive>
  page.tsx                renders <MiniApp />
  globals.css             tokens, glass/aurora/grain, motion, reduced-motion
  api/auth/route.ts       POST initData -> verified user | 401
components/
  miniapp/
    mini-app.tsx          client shell: tab state, hash routing, Telegram boot
    panels/referral-panel.tsx  referral tab — reports unavailable data, never sample values
    tab-bar.tsx           shared bottom nav, sliding gold indicator, arrow-key support
    top-bar.tsx           shared brand bar (same website and Telegram UI)
    tabs.ts               tab definitions (single source of truth)
    brand-mark.tsx        inline SVG monogram
  ui/                     button, badge, card (shadcn conventions)
lib/
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

## Deploying as a Mini App

1. Deploy this Next.js app to an HTTPS host (for example Vercel). Use the same deployed
   URL for the website and Telegram Mini App; Telegram requires HTTPS.
2. Create/configure a bot with `@BotFather`, then create its Mini App with `/newapp`
   and set the deployed site URL. BotFather supplies the Mini App short name.
3. Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (without `@`) and
   `NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME` to create the site's `https://t.me/<bot>/<app>`
   link, then rebuild and deploy. The link is intentionally hidden until both are set.
4. Configure the bot menu button in BotFather to open the same Mini App. Set
   `TELEGRAM_BOT_TOKEN` as a server-only host secret to enable `POST /api/auth`.

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
short name, and set `TELEGRAM_BOT_TOKEN` as a server-only secret. The `/api/auth` route
validates Telegram `initData`, but does not yet persist accounts or issue a session. Real
campaigns, referrals, earnings, and payouts are not available because their database and
business logic are not implemented.

## Not built yet

- Neon + Drizzle schema, migrations, and session cookies
- Real campaigns, reward crediting, payout ledger
- Referral persistence, server-issued invite codes, attribution and fraud checks
- Localisation / `@telegram-apps/telegram-ui` migration if native chrome is preferred
