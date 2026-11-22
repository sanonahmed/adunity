"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  Megaphone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  hapticTap,
  initTelegram,
  isTelegramClient,
  type TelegramUser,
} from "@/lib/telegram";
import { ReferralPanel } from "./panels/referral-panel";
import { TabBar } from "./tab-bar";
import { isTabId, type TabId } from "./tabs";
import { TopBar } from "./top-bar";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
const APP_SHORT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME;
const TELEGRAM_APP_URL =
  BOT_USERNAME && APP_SHORT_NAME
    ? `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}`
    : null;

/* Avoid useLayoutEffect's server warning while resolving Telegram/deep-link
   state before the first browser paint. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** `?startapp=referral` -> "referral". Unknown values fall back to Home. */
function tabFromStartParam(value: string | null | undefined): TabId | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return isTabId(normalized) ? normalized : null;
}

const COMING_SOON = {
  ads: {
    icon: Megaphone,
    eyebrow: "Campaigns",
    title: "A better way to discover.",
    description:
      "A considered selection of campaigns is on its way. Check back soon.",
  },
  profile: {
    icon: UserRound,
    eyebrow: "Your account",
    title: "Your space, your progress.",
    description:
      "Your Telegram profile and activity will live here, all in one place.",
  },
} as const;

export function MiniApp() {
  const [active, setActive] = useState<TabId>("home");
  const [user, setUser] = useState<TelegramUser | null>(null);
  /* Server HTML cannot know this; resolved before the first paint below. */
  const [inTelegram, setInTelegram] = useState(false);
  const tabHistory = useRef<TabId[]>(["home"]);
  /* StrictMode re-runs effects; history entries must not be duplicated. */
  const seededHistory = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const app = initTelegram();
    setUser(app?.initDataUnsafe.user ?? null);
    /* The SDK script is `beforeInteractive`, so this is already accurate. */
    setInTelegram(isTelegramClient());

    const fromHash = window.location.hash.slice(1);
    const fromQuery = new URLSearchParams(window.location.search).get("startapp") ?? undefined;
    const requestedTab =
      (isTabId(fromHash) ? fromHash : null) ??
      tabFromStartParam(app?.initDataUnsafe.start_param ?? fromQuery) ??
      "home";

    // Create an in-app home entry for direct hash/startapp links so both the
    // browser Back action and Telegram's native Back button return to Home.
    if (!seededHistory.current) {
      if (requestedTab !== "home") {
        window.history.pushState(null, "", "#home");
        window.history.pushState(null, "", `#${requestedTab}`);
        tabHistory.current = ["home", requestedTab];
      }
      seededHistory.current = true;
    }
    setActive(requestedTab);

    const onHistoryChange = () => {
      const id = window.location.hash.slice(1);
      const next = isTabId(id) ? id : "home";
      const history = tabHistory.current;
      const existing = history.lastIndexOf(next);
      if (existing >= 0) history.splice(existing + 1);
      else history.push(next);
      setActive(next);
    };

    window.addEventListener("hashchange", onHistoryChange);
    window.addEventListener("popstate", onHistoryChange);
    return () => {
      window.removeEventListener("hashchange", onHistoryChange);
      window.removeEventListener("popstate", onHistoryChange);
    };
  }, []);

  useEffect(() => {
    /* The SDK object exists in browsers too; only drive native chrome when the
       page was actually launched from Telegram. */
    if (!isTelegramClient()) return;

    const backButton = window.Telegram?.WebApp?.BackButton;
    if (!backButton) return;

    if (active === "home") {
      backButton.hide();
      return;
    }

    const goBack = () => {
      if (tabHistory.current.length > 1) {
        window.history.back();
      } else {
        navigate("home");
      }
    };
    backButton.onClick(goBack);
    backButton.show();
    return () => backButton.offClick(goBack);
  }, [active]);

  function navigate(id: TabId) {
    if (id === active) return;
    hapticTap();
    tabHistory.current.push(id);
    setActive(id);
    window.history.pushState(null, "", `#${id}`);
  }

  return (
    <div className="app-canvas min-h-dvh overflow-x-hidden">
      <div className="aurora" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar />

        <main className="mx-auto w-full max-w-md flex-1 px-5 pb-36">
          <section
            id="panel-home"
            role="tabpanel"
            aria-labelledby="tab-home"
            tabIndex={0}
            hidden={active !== "home"}
            className="panel-enter pt-9 outline-none"
          >
            <div className="rise">
              <Badge variant="gold">
                <span className="size-1.5 rounded-full bg-gold" aria-hidden="true" />
                Built for Telegram
              </Badge>

              <h1 className="display mt-5">
                <span className="block text-foreground">Meet</span>
                <span className="gold-text mt-1 block">AdUnity.</span>
              </h1>

              <p className="mt-5 max-w-[33ch] text-[15px] leading-relaxed text-muted-foreground">
                AdUnity on the web and inside Telegram. Campaigns, account
                persistence, referrals, and rewards are not connected to backend
                services yet.
              </p>
            </div>

            <div className="rise-late mt-8 flex gap-3">
              <Button
                size="lg"
                className="flex-1"
                onClick={() => navigate("ads")}
              >
                Explore AdUnity
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                aria-label="Go to your profile"
                onClick={() => navigate("profile")}
                className="px-4"
              >
                <UserRound aria-hidden="true" />
              </Button>
            </div>

            <div className="glass mt-10 rounded-3xl p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">Current status</p>
                <span className="grid size-8 place-items-center rounded-lg border border-gold/15 bg-gold-soft text-gold">
                  <Compass className="size-4" aria-hidden="true" />
                </span>
              </div>

              <div className="hairline my-5" />

              <ul className="space-y-4">
                {[
                  {
                    icon: ShieldCheck,
                    title: "Telegram verification",
                    body: "The server verification endpoint requires the real BotFather token.",
                  },
                  {
                    icon: Megaphone,
                    title: "Campaigns",
                    body: "No live campaign data is connected yet.",
                  },
                  {
                    icon: Sparkles,
                    title: "Referrals and rewards",
                    body: "Tracking, earnings, and payouts require backend services that are not connected yet.",
                  },
                ].map((feature) => {
                  const Icon = feature.icon;

                  return (
                    <li key={feature.title} className="flex items-start gap-3">
                      <Icon
                        className="mt-0.5 size-4 shrink-0 text-gold/85"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold tracking-[-0.01em]">
                          {feature.title}
                        </p>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                          {feature.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <ReferralPanel active={active === "referral"} />

          {(["ads", "profile"] as const).map((id) => {
            const content = COMING_SOON[id];
            const Icon = content.icon;

            return (
              <section
                key={id}
                id={`panel-${id}`}
                role="tabpanel"
                aria-labelledby={`tab-${id}`}
                tabIndex={0}
                hidden={active !== id}
                className="panel-enter pt-14 outline-none"
              >
                <div className="rise glass overflow-hidden rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-2xl border border-gold/20 bg-gold-soft text-gold">
                      <Icon className="size-[19px]" aria-hidden="true" />
                    </span>
                    <Badge variant="muted">Coming soon</Badge>
                  </div>

                  <p className="eyebrow mt-9">{content.eyebrow}</p>
                  <h1 className="mt-2 max-w-[13ch] text-[29px] font-semibold leading-[1.08] tracking-[-0.04em]">
                    {content.title}
                  </h1>
                  <p className="mt-3 max-w-[36ch] text-[13.5px] leading-relaxed text-muted-foreground">
                    {content.description}
                  </p>

                  <div className="hairline my-6" />
                  <div className="flex items-center gap-2 text-[11.5px] text-foreground/60">
                    <span className="size-1.5 rounded-full bg-gold/80" />
                    <span>Same AdUnity Mini App on web and Telegram</span>
                  </div>
                </div>

                {id === "profile" ? (
                  <div className="rise-late glass mt-3 flex items-center gap-3 rounded-2xl p-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground">
                      <UserRound className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold">
                        {user
                          ? [user.first_name, user.last_name]
                              .filter(Boolean)
                              .join(" ")
                          : "Telegram profile"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {user?.username
                          ? `@${user.username}`
                          : "Open in Telegram to load your profile"}
                      </p>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}

          {!inTelegram ? (
            <>
              <p className="mt-12 text-center text-[9.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground/40">
                AdUnity · Same app on web and Telegram
              </p>
              {TELEGRAM_APP_URL ? (
                <p className="mt-3 text-center">
                  <a
                    href={TELEGRAM_APP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:underline"
                  >
                    Open in Telegram
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </a>
                </p>
              ) : null}
            </>
          ) : null}
        </main>

        <TabBar active={active} onChange={navigate} />

      </div>

      {/* __TOAST__ */}
    </div>
  );
}
