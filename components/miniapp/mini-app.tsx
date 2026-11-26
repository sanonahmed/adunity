"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Compass, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import {
  hapticTap,
  initTelegram,
  INK,
  isTelegramClient,
  setChromeColor,
  type TelegramUser,
} from "@/lib/telegram";
import { useReferral } from "./use-referral";
import { MarketList } from "./market-list";
import { demoBalanceBdt, parseDemoSales, remainingQuantity, type BuyerRequest, type DemoSaleRecord } from "@/lib/market";
import { clearLegacyDemoSales, createDemoSaleId, readLegacyDemoSales } from "@/lib/demo-sales";
import { ReferralPanel } from "./panels/referral-panel";
import { ProfilePanel } from "./panels/profile-panel";
import { AutoBotPanel } from "./panels/auto-bot-panel";
import { TabBar } from "./tab-bar";
import { REFERRAL_COMMISSION_PERCENT } from "@/lib/referral";
import { isTabId, type TabId } from "./tabs";
import { TopBar } from "./top-bar";
import { Toast, useToast } from "./toast";

/* Avoid useLayoutEffect's server warning while resolving Telegram/deep-link
   state before the first browser paint. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Stable empty list while saved receipts are restored after mount. */
const NO_DEMO_SALES: DemoSaleRecord[] = [];

/** `?startapp=referral` -> "referral". Unknown values fall back to Home. */
function tabFromStartParam(value: string | null | undefined): TabId | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return isTabId(normalized) ? normalized : null;
}

export function MiniApp() {
  const [active, setActive] = useState<TabId>("home");
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerRequest | null>(null);
  const [demoSales, setDemoSales] = useState<DemoSaleRecord[] | null>(null);
  const demoSalesRef = useRef<DemoSaleRecord[] | null>(null);
  const pendingDemoSaleRef = useRef<{ buyerId: string; quantity: number; id: string } | null>(null);
  /* Signed launch payload; empty until the Telegram SDK is initialized below. */
  const [initData, setInitData] = useState("");
  /* Keep the shared toast host mounted for other app notifications. */
  const { message: toastMessage, show: showToast } = useToast();
  const referral = useReferral(initData);
  /* The Auto Bot section paints its own white page, so the chrome around it
     (canvas, top bar, tab bar, Telegram strip) switches along with the tab. */
  const lightSurface = active === "ads";
  const tabHistory = useRef<TabId[]>(["home"]);
  /* StrictMode re-runs effects; history entries must not be duplicated. */
  const seededHistory = useRef(false);

  useEffect(() => {
    demoSalesRef.current = null;
    setDemoSales(null);
    if (!initData) return;

    const controller = new AbortController();
    const legacySales = readLegacyDemoSales();
    void fetch("/api/demo-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, legacySales }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; sales?: unknown; error?: string };
        if (!response.ok || !payload.ok || !Array.isArray(payload.sales)) {
          throw new Error(payload.error ?? "store_error");
        }
        const restoredSales = parseDemoSales(payload.sales);
        demoSalesRef.current = restoredSales;
        setDemoSales(restoredSales);
        clearLegacyDemoSales();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        showToast("Demo receipts couldn't be loaded from the database. Please retry later.");
      });

    return () => controller.abort();
  }, [initData, showToast]);

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

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootBackground = root.style.backgroundColor;
    const previousBodyBackground = body.style.backgroundColor;
    const previousColorScheme = root.style.colorScheme;
    const background = lightSurface ? "#ffffff" : "";

    root.style.backgroundColor = background;
    root.style.colorScheme = lightSurface ? "light" : "";
    body.style.backgroundColor = background;
    setChromeColor(lightSurface ? "#ffffff" : INK);

    return () => {
      root.style.backgroundColor = previousRootBackground;
      root.style.colorScheme = previousColorScheme;
      body.style.backgroundColor = previousBodyBackground;
    };
  }, [lightSurface]);

  function navigate(id: TabId) {
    if (id === active) return;
    hapticTap();
    tabHistory.current.push(id);
    setActive(id);
    window.history.pushState(null, "", `#${id}`);
  }

  return (
    <div
      className={`app-canvas min-h-dvh overflow-x-hidden${lightSurface ? " app-canvas-light" : ""}`}
    >
      {/* The ambient layers are fixed-position children of the canvas, so they
          would tint the white page through its stacking context. */}
      {lightSurface ? null : (
        <>
          <div className="aurora" aria-hidden="true" />
          <div className="grain" aria-hidden="true" />
        </>
      )}

      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar light={lightSurface} />

        <main className="mx-auto w-full max-w-md flex-1 px-5 pb-36">
          <section
            id="panel-home"
            role="tabpanel"
            aria-labelledby="tab-home"
            tabIndex={0}
            hidden={active !== "home"}
            className="panel-enter pt-9 outline-none"
          >
            <h1 className="sr-only">AdUnity</h1>

            <MarketList
              demoSales={demoSales ?? NO_DEMO_SALES}
              onNavigateToAutoBot={(request) => {
                // MarketList already includes saved demo receipts in fulfilled.
                setSelectedBuyer(request);
                navigate("ads");
              }}
            />

            <div className="glass mt-6 rounded-3xl p-5">
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
            demoBalanceBdt={demoBalanceBdt(demoSales ?? NO_DEMO_SALES)}
          />

          <AutoBotPanel
            active={active === "ads"}
            buyer={selectedBuyer}
            onSellDemo={async (quantity) => {
              if (!selectedBuyer || quantity < 1 || demoSalesRef.current === null || !initData) {
                showToast("Open AdUnity from Telegram and wait for your receipts to load before saving a demo sale.");
                return false;
              }
              const sold = Math.min(quantity, remainingQuantity(selectedBuyer));
              if (sold < 1) return false;

              try {
                const pending = pendingDemoSaleRef.current;
                const saleId = pending?.buyerId === selectedBuyer.id && pending.quantity === sold
                  ? pending.id
                  : createDemoSaleId();
                pendingDemoSaleRef.current = { buyerId: selectedBuyer.id, quantity: sold, id: saleId };
                const response = await fetch("/api/demo-sales", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    initData,
                    sale: { id: saleId, buyerId: selectedBuyer.id, quantity: sold },
                  }),
                  cache: "no-store",
                });
                const payload = await response.json() as { ok?: boolean; sales?: unknown; error?: string };
                if (!response.ok || !payload.ok || !Array.isArray(payload.sales)) {
                  showToast(payload.error === "quantity_unavailable"
                    ? "The remaining demo quantity changed. Please return Home and try again."
                    : "The demo sale couldn't be saved to the database. Please try again.");
                  return false;
                }
                const savedSales = parseDemoSales(payload.sales);
                pendingDemoSaleRef.current = null;
                demoSalesRef.current = savedSales;
                setDemoSales(savedSales);
                clearLegacyDemoSales();
                setSelectedBuyer(null);
                navigate("home");
                return true;
              } catch {
                showToast("The demo sale couldn't be saved to the database. Please check your connection and retry.");
                return false;
              }
            }}
          />

        </main>

        <TabBar active={active} onChange={navigate} light={lightSurface} />

      </div>

      <Toast message={toastMessage} />
    </div>
  );
}
