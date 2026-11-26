"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CircleCheck,
  Info,
  RefreshCw,
  Store,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  MARKET_FILTERS,
  formatBdt,
  formatRelative,
  fulfillmentPercent,
  isFullyDelivered,
  remainingQuantity,
  totalBudget,
  type BuyerRequest,
  type DemoSaleRecord,
  type MarketFilter,
} from "@/lib/market";

const AVATAR_TONES = [
  "border-gold/20 bg-gold-soft text-gold",
  "border-emerald-300/20 bg-emerald-300/[0.1] text-emerald-200/85",
  "border-sky-300/20 bg-sky-300/[0.1] text-sky-200/85",
  "border-fuchsia-300/20 bg-fuchsia-300/[0.1] text-fuchsia-200/85",
] as const;

/** Two initials from a display name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return `${first}${second}`.toUpperCase();
}

/** Stable avatar tone per request id, so rows keep their colour on re-render. */
function toneFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 997;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function BuyerRow({
  request,
  demoSold,
  onSell,
}: {
  request: BuyerRequest;
  demoSold: number;
  onSell: (request: BuyerRequest) => void;
}) {
  const progress = fulfillmentPercent(request);
  const complete = isFullyDelivered(request);

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-xl border text-[11px] font-semibold ${toneFor(request.id)}`}
          aria-hidden="true"
        >
          {initialsOf(request.buyer)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold leading-tight">
            <span className="truncate">{request.buyer}</span>
            {request.verified ? (
              <BadgeCheck
                className="size-3.5 shrink-0 text-gold/85"
                aria-label="Verified buyer"
                role="img"
              />
            ) : null}
          </p>
          <p className="mt-1 truncate text-[10.5px] leading-relaxed text-muted-foreground">
            Wants {request.quantity} {request.item}
          </p>
          {demoSold > 0 ? (
            <p className="mt-1 text-[10px] font-medium text-emerald-200/80">
              You sold {demoSold} demo {demoSold === 1 ? "sample" : "samples"} to {request.buyer} · illustrative only
            </p>
          ) : null}

          <div className="mt-2">
            <div className="flex items-center justify-between gap-2 text-[9.5px]">
              <span className="text-muted-foreground">Buyer progress</span>
              <span className="tabular-nums text-muted-foreground">
                {request.fulfilled} of {request.quantity} delivered
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`Buyer progress: ${request.fulfilled} of ${request.quantity} accounts delivered`}
              aria-valuemin={0}
              aria-valuemax={request.quantity}
              aria-valuenow={request.fulfilled}
              className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                  complete
                    ? "bg-emerald-300/75"
                    : "bg-[linear-gradient(90deg,#b8965e,#f4e6c6)]"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground/70">
              {complete
                ? "Fully delivered"
                : `${progress}% filled · ${remainingQuantity(request)} ${
                    remainingQuantity(request) === 1 ? "account" : "accounts"
                  } left`}
            </p>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] text-muted-foreground/80">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-medium">
              {request.requirement}
            </span>
            <span>{formatRelative(request.createdAt)}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[12.5px] font-semibold leading-tight tabular-nums">
            {formatBdt(request.budgetPerAccountBdt)}
          </p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">
            per account
          </p>
          <p className="mt-1 text-[9.5px] tabular-nums text-muted-foreground">
            {formatBdt(totalBudget(request))} total
          </p>
        </div>
      </div>

      {complete ? (
        <p className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] px-4 py-2.5 text-[12px] font-semibold text-emerald-200/85">
          <CircleCheck className="size-3.5" aria-hidden="true" />
          Fully delivered
        </p>
      ) : (
        <button
          type="button"
          onClick={() => onSell(request)}
          aria-label={`Sell accounts to ${request.buyer}`}
          className="tap mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#228BE6] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(34,139,230,0.26)] transition-colors duration-200 hover:bg-[#1c7ed6] active:bg-[#1971c2]"
        >
          Sell Now
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function SkeletonRow() {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" aria-hidden="true">
      <span className="size-9 shrink-0 animate-pulse rounded-xl bg-white/[0.05]" />
      <div className="flex-1 space-y-2 py-0.5">
        <span className="block h-2.5 w-28 animate-pulse rounded-full bg-white/[0.07]" />
        <span className="block h-2 w-40 animate-pulse rounded-full bg-white/[0.05]" />
      </div>
      <span className="mt-1 block h-2.5 w-12 animate-pulse rounded-full bg-white/[0.06]" />
    </li>
  );
}

type MarketPayload = {
  ok?: boolean;
  buyers?: BuyerRequest[];
  error?: string;
};

/**
 * Buyer requests shown on Home.
 *
 * Reads the same feed the admin panel writes to (`/api/market/buyers`), so a
 * listing appears here the moment it is published. Public responses contain
 * open listings only and never include admin notes or contact handles.
 */
export function MarketList({
  onNavigateToAutoBot,
  demoSales,
}: {
  onNavigateToAutoBot: (request: BuyerRequest) => void;
  demoSales: DemoSaleRecord[];
}) {
  const [buyers, setBuyers] = useState<BuyerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<MarketFilter>("All");

  const handleSell = useCallback((request: BuyerRequest) => {
    onNavigateToAutoBot(request);
  }, [onNavigateToAutoBot]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetch("/api/market/buyers", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as MarketPayload;
        if (!response.ok || !payload.ok || !Array.isArray(payload.buyers)) {
          throw new Error(payload.error ?? "store_error");
        }
        setBuyers(payload.buyers);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(
          cause instanceof Error && cause.message === "server_not_configured"
            ? "Buyer requests will appear once the market is connected."
            : "Buyer requests are temporarily unavailable.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [attempt]);

  const buyersWithDemoSales = useMemo(
    () => buyers.map((request) => {
      const sold = demoSales
        .filter((sale) => sale.buyerId === request.id)
        .reduce((sum, sale) => sum + sale.quantity, 0);
      return { ...request, fulfilled: Math.min(request.quantity, request.fulfilled + sold) };
    }),
    [buyers, demoSales],
  );
  const visible = useMemo(
    () => filter === "All"
      ? buyersWithDemoSales
      : buyersWithDemoSales.filter((request) => request.requirement === filter),
    [filter, buyersWithDemoSales],
  );

  const totalQuantity = visible.reduce((sum, request) => sum + request.quantity, 0);
  const totalFulfilled = visible.reduce((sum, request) => sum + request.fulfilled, 0);
  return (
    <div className="glass rise rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Market</p>
          <h2 className="mt-1.5 text-[16px] font-semibold tracking-[-0.02em]">
            Buyer requests
          </h2>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/15 bg-gold-soft text-gold">
          <Store className="size-4" aria-hidden="true" />
        </span>
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
        Approved requests from the AdUnity team, newest first.
      </p>

      <div className="mt-3">
        <Badge variant="muted">Demo listings</Badge>
      </div>

      <div className="scrollbar-hide -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {MARKET_FILTERS.map((option) => {
          const selected = option === filter;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={selected}
              className={`tap shrink-0 rounded-full border px-3 py-1.5 text-[10.5px] font-semibold transition-colors ${
                selected
                  ? "border-gold/30 bg-gold-soft text-gold"
                  : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:border-white/15 hover:text-foreground/80"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Users className="size-3 shrink-0 text-gold/70" aria-hidden="true" />
        <span>
          {loading
            ? "Loading requests…"
            : error
              ? "Feed unavailable"
              : `${visible.length} open ${visible.length === 1 ? "request" : "requests"} · ${totalQuantity} ${totalQuantity === 1 ? "account" : "accounts"} wanted · ${totalFulfilled} delivered`}
        </span>
      </div>

      {error ? (
        <div className="mt-3 rounded-2xl border border-white/[0.09] px-4 py-5 text-center">
          <p className="text-[12px] font-medium">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="tap mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : loading ? (
        <ul className="mt-2 divide-y divide-white/[0.06]" aria-hidden="true">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </ul>
      ) : visible.length > 0 ? (
        <ul className="mt-2 divide-y divide-white/[0.06]" aria-live="polite">
          {visible.map((request) => (
            <BuyerRow
              key={request.id}
              request={request}
              demoSold={demoSales
                .filter((sale) => sale.buyerId === request.id)
                .reduce((sum, sale) => sum + sale.quantity, 0)}
              onSell={handleSell}
            />
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-white/[0.09] px-4 py-5 text-center">
          <p className="text-[12px] font-medium">No requests here yet</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
            Try another filter — approved requests appear here as they are posted.
          </p>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <span>
          Sample listings managed by the AdUnity team. Buyer names, budgets and delivery counts
          are illustrative. Demo receipts are saved to the database for your signed-in Telegram
          account; no real accounts are sold, transferred or delivered, and no payment is made.
        </span>
      </p>
    </div>
  );
}
