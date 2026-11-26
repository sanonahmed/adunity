"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Gift, LoaderCircle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACTIVATION_PRICE,
  ACTIVATION_PURCHASE_LIMITS,
  activationPurchaseErrorText,
  formatUsdtAmount,
  parseActivationPurchase,
  parseActivationPurchaseKey,
  type ActivationPurchase,
  type ActivationPurchaseKey,
} from "@/lib/activation-purchase";

const REFERRALS_FOR_FREE_KEY = 20;

type ApiResponse = {
  ok?: boolean;
  error?: string;
  enabled?: boolean;
  purchase?: unknown;
  key?: unknown;
};

function safeCheckoutUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Activation-key offers and progress toward the verified-referral reward. */
export function OfferPanel({
  active,
  initData,
  referralCount,
  referralLoading,
  referralError,
  onGoToReferrals,
}: {
  active: boolean;
  initData: string;
  referralCount: number;
  referralLoading: boolean;
  referralError: boolean;
  onGoToReferrals: () => void;
}) {
  const [checkoutEnabled, setCheckoutEnabled] = useState<boolean | null>(null);
  const [purchase, setPurchase] = useState<ActivationPurchase | null>(null);
  const [deliveredKey, setDeliveredKey] = useState<ActivationPurchaseKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const pollBusy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/binance-pay/orders", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json() as Promise<ApiResponse>)
      .then((payload) => setCheckoutEnabled(payload.ok === true && payload.enabled === true))
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setCheckoutEnabled(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!initData || !purchase || purchase.status !== "pending" || deliveredKey) return;
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const poll = async () => {
      if (pollBusy.current) {
        timer = window.setTimeout(poll, ACTIVATION_PURCHASE_LIMITS.pollIntervalMs);
        return;
      }
      pollBusy.current = true;
      try {
        const response = await fetch("/api/binance-pay/orders/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, purchaseId: purchase.id }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as ApiResponse;
        if (!response.ok || payload.ok !== true) throw new Error(payload.error ?? "store_error");
        const updated = parseActivationPurchase(payload.purchase);
        if (updated) setPurchase(updated);
        const key = parseActivationPurchaseKey(payload.key);
        if (key) setDeliveredKey(key);
        if (updated && updated.status !== "pending") return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        // Keep retrying transient network/provider failures; fulfillment remains server-verified.
      } finally {
        pollBusy.current = false;
      }
      if (!cancelled) timer = window.setTimeout(poll, ACTIVATION_PURCHASE_LIMITS.pollIntervalMs);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
    };
  }, [deliveredKey, initData, purchase?.id, purchase?.status]);

  async function startCheckout() {
    if (!initData || busy) return;
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/binance-pay/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
        cache: "no-store",
      });
      const payload = await response.json() as ApiResponse;
      const created = parseActivationPurchase(payload.purchase);
      if (!response.ok || payload.ok !== true || !created) {
        setError(activationPurchaseErrorText(payload.error));
        return;
      }
      setPurchase(created);
    } catch {
      setError("Could not start Binance Pay checkout. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!deliveredKey) return;
    try {
      await navigator.clipboard.writeText(deliveredKey.secret);
      setCopied(true);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the activation key above.");
    }
  }

  const progress = Math.min(referralCount, REFERRALS_FOR_FREE_KEY);
  const progressPercent = (progress / REFERRALS_FOR_FREE_KEY) * 100;

  return (
    <section
      id="panel-offer"
      role="tabpanel"
      aria-labelledby="tab-offer"
      tabIndex={0}
      hidden={!active}
      className="panel-enter space-y-3 pt-9 outline-none"
    >
      <div className="rise">
        <p className="eyebrow">Auto Bot</p>
        <h1 className="mt-2 text-[29px] font-semibold leading-[1.08] tracking-[-0.04em]">
          Activation offers
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Choose a paid key or earn one by inviting verified users.
        </p>
      </div>

      <article className="glass rise rounded-3xl p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-gold/20 bg-gold-soft text-gold">
            <Tag className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="rounded-full border border-gold/20 bg-gold/[0.07] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-gold">
            Paid offer
          </span>
        </div>
        <p className="eyebrow mt-5">Auto Bot activation</p>
        <div className="mt-1 flex items-baseline gap-2">
          <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Activation key</h2>
          <span className="text-[16px] font-semibold text-gold">{ACTIVATION_PRICE.label}</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          One activation key for Auto Bot. Pay securely in USDT with Binance Pay.
        </p>
        {purchase ? (
          <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/10 p-3.5" aria-live="polite">
            {deliveredKey ? (
              <div>
                <div className="flex items-center gap-2 text-emerald-200">
                  <Check className="size-4" aria-hidden="true" />
                  <p className="text-[12px] font-semibold">Payment confirmed — your key is ready</p>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">This key is shown once. Copy it now and save it somewhere secure.</p>
                <code className="mt-3 block break-all rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 font-mono text-[12px] text-foreground select-all">
                  {deliveredKey.secret}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyKey()} className="mt-3 w-full">
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? "Copied" : "Copy activation key"}
                </Button>
              </div>
            ) : purchase.status === "pending" ? (
              <div>
                <p className="text-[12px] font-semibold">Complete your Binance Pay checkout</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">After payment, keep this screen open while we securely verify it and deliver your key.</p>
                <a
                  href={safeCheckoutUrl(purchase.checkoutUrl) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!safeCheckoutUrl(purchase.checkoutUrl)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#f8edd3_0%,#e6d2a8_46%,#c9a86f_100%)] px-4 text-[12px] font-semibold text-[#171208] shadow-[0_16px_36px_-18px_rgba(230,210,168,0.8)] aria-disabled:pointer-events-none aria-disabled:opacity-50"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" /> Open secure checkout
                </a>
                <p className="mt-2 text-center text-[9px] text-muted-foreground">{formatUsdtAmount(purchase.amount)} {purchase.currency} · Expires {new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(purchase.expiresAt))}</p>
              </div>
            ) : (
              <div>
                <p className="text-[12px] font-semibold">{purchase.status === "paid" ? "Payment confirmed" : purchase.status === "expired" ? "Checkout expired" : purchase.status === "refunded" ? "Payment refunded" : "Checkout closed"}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{purchase.status === "paid" ? "We confirmed this payment, but this screen did not receive the key. Contact support before starting another checkout." : purchase.status === "refunded" ? "This payment was refunded. Contact support if you need help." : "No activation key was issued for this checkout. You can start a new one."}</p>
                {purchase.status === "paid" ? null : <Button type="button" size="sm" onClick={() => { setPurchase(null); setDeliveredKey(null); setError(""); }} className="mt-3 w-full">Start a new checkout</Button>}
              </div>
            )}
          </div>
        ) : (
          <>
            <Button
              type="button"
              onClick={() => void startCheckout()}
              disabled={!checkoutEnabled || !initData || busy}
              className="mt-4 w-full"
              aria-describedby="activation-checkout-note"
            >
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Tag aria-hidden="true" />}
              {busy ? "Opening secure checkout…" : checkoutEnabled === null ? "Checking secure checkout…" : checkoutEnabled ? `Pay ${ACTIVATION_PRICE.label} · ${ACTIVATION_PRICE.currency}` : "Checkout unavailable"}
            </Button>
            <p id="activation-checkout-note" className="mt-2 text-center text-[9.5px] leading-relaxed text-muted-foreground/75">
              {checkoutEnabled && initData ? "Secure Binance Pay checkout. Your key is delivered here after verified payment." : !initData ? "Open AdUnity in Telegram to purchase with your verified account." : "Secure checkout is not configured yet."}
            </p>
          </>
        )}
        {error ? <p className="mt-3 rounded-lg border border-red-300/15 bg-red-300/[0.05] px-3 py-2 text-[10px] leading-relaxed text-red-200" role="alert">{error}</p> : null}
      </article>

      <article className="glass rise-late rounded-3xl p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200">
            <Gift className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-200/85">
            Free reward
          </span>
        </div>
        <p className="eyebrow mt-5">Referral reward</p>
        <h2 className="mt-1 text-[20px] font-semibold leading-tight tracking-[-0.03em]">
          Get a free activation key
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Refer 20 people with verified Telegram accounts to qualify.
        </p>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-[10px]">
            <span className="font-medium text-foreground/75">Verified referrals</span>
            <span className="tabular-nums text-muted-foreground" aria-live="polite">
              {referralError
                ? "Unavailable"
                : referralLoading
                  ? "Loading…"
                  : `${progress} / ${REFERRALS_FOR_FREE_KEY}`}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-white/[0.08]"
            role="progressbar"
            aria-label="Verified referrals toward a free activation key"
            aria-valuemin={0}
            aria-valuemax={REFERRALS_FOR_FREE_KEY}
            aria-valuenow={referralError || referralLoading ? 0 : progress}
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#80cfa4,#b3f0c7)] transition-[width] duration-500"
              style={{ width: referralError || referralLoading ? "0%" : `${progressPercent}%` }}
            />
          </div>
          {referralError ? (
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              Referral progress couldn’t be loaded. Visit Referral to try again.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onGoToReferrals}
          className="tap mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-[12px] font-semibold text-foreground transition-colors hover:border-gold/25 hover:text-gold"
        >
          Go to Referral
        </button>
        <p className="mt-2 text-center text-[9.5px] leading-relaxed text-muted-foreground/75">
          Only verified referrals count. Reward key issuance isn’t automated yet.
        </p>
      </article>
    </section>
  );
}
