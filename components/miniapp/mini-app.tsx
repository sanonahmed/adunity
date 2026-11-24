"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
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
import { useReferral } from "./use-referral";
import { ReferralPanel } from "./panels/referral-panel";
import { ProfilePanel } from "./panels/profile-panel";
import { AutoBotPanel } from "./panels/auto-bot-panel";
import { TabBar } from "./tab-bar";
import { REFERRAL_COMMISSION_PERCENT } from "@/lib/referral";
import { isTabId, type TabId } from "./tabs";
import { TopBar } from "./top-bar";

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

export function MiniApp() {
  const [active, setActive] = useState<TabId>("home");
  const [user, setUser] = useState<TelegramUser | null>(null);
  /* Signed launch payload; empty until the browser-only check below runs. */
  const [initData, setInitData] = useState("");
  const referral = useReferral(initData);
  const tabHistory = useRef<TabId[]>(["home"]);
  /* StrictMode re-runs effects; history entries must not be duplicated. */
  const seededHistory = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const app = initTelegram();
    setUser(app?.initDataUnsafe.user ?? null);
    setInitData(app?.initData ?? "");

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
                Discover, share and grow — all inside Telegram. Your referral
                dashboard tracks every verified invitation in one place.
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
                <p className="eyebrow">Your progress</p>
                <span className="grid size-8 place-items-center rounded-lg border border-gold/15 bg-gold-soft text-gold">
                  <Compass className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div className="hairline my-5" />
              <ul className="space-y-4">
                {[
                  {
                    icon: ShieldCheck,
                    title: "Verified account",
                    body: user
                      ? "You're signed in with your Telegram account."
                      : "Open AdUnity from Telegram to verify your account.",
                  },
                  {
                    icon: Megaphone,
                    title: "Campaigns",
                    body: "Campaigns are on their way. Check back soon.",
                  },
                  {
                    icon: Sparkles,
                    title: "Referrals and rewards",
                    body: referral.summary
                      ? `${referral.summary.invitedCount} verified ${
                          referral.summary.invitedCount === 1 ? "invite" : "invites"
                        } · ${referral.summary.rewards.commissionPercent}% referral share of their ad revenue.`
                      : `Your invites and ${REFERRAL_COMMISSION_PERCENT}% share of referred users’ ad revenue are in the Referral tab.`,
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

          <ReferralPanel
            active={active === "referral"}
            initData={initData}
            referral={referral}
          />

          <ProfilePanel
            active={active === "profile"}
            user={user}
            referral={referral.summary}
            loading={referral.loading}
          />

          <AutoBotPanel active={active === "ads"} />

        </main>

        <TabBar active={active} onChange={navigate} />

      </div>

      {/* __TOAST__ */}
    </div>
  );
}
