"use client";

import { Archive, BadgeCheck, Pause, Pencil, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatBdt,
  formatDateTime,
  formatRelative,
  fulfillmentPercent,
  isFullyDelivered,
  remainingQuantity,
  totalBudget,
  type BuyerRequest,
  type BuyerStatus,
} from "@/lib/market";

const STATUS_STYLES: Record<BuyerStatus, string> = {
  open: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  paused: "border-gold/25 bg-gold-soft text-gold",
  archived: "border-white/10 bg-white/[0.04] text-muted-foreground",
};

export function ListingRow({
  request,
  busy,
  onEdit,
  onStatus,
  onArchive,
}: {
  request: BuyerRequest;
  busy: boolean;
  onEdit: (request: BuyerRequest) => void;
  onStatus: (request: BuyerRequest, status: BuyerStatus) => void;
  onArchive: (request: BuyerRequest) => void;
}) {
  const archived = request.status === "archived";
  const progress = fulfillmentPercent(request);
  const complete = isFullyDelivered(request);

  return (
    <li className="glass rounded-2xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold tracking-[-0.01em]">
              <span className="truncate">{request.buyer}</span>
              {request.verified ? (
                <BadgeCheck className="size-4 shrink-0 text-gold/85" aria-label="Verified" role="img" />
              ) : null}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${STATUS_STYLES[request.status]}`}
            >
              {request.status}
            </span>
          </div>

          <p className="mt-1 text-[12px] text-muted-foreground">
            Wants <span className="text-foreground/85">{request.quantity}</span> {request.item}
            {" · "}
            <span className="text-foreground/70">{request.requirement}</span>
          </p>

          <div className="mt-2 max-w-sm">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-muted-foreground">Buyer progress</span>
              <span className="tabular-nums text-foreground/80">
                {request.fulfilled} / {request.quantity} delivered · {progress}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`Buyer progress: ${request.fulfilled} of ${request.quantity} accounts delivered`}
              aria-valuemin={0}
              aria-valuemax={request.quantity}
              aria-valuenow={request.fulfilled}
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                  complete
                    ? "bg-emerald-300/80"
                    : "bg-[linear-gradient(90deg,#b8965e,#f4e6c6)]"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/75">
              {complete
                ? "Fully delivered — archive it to clear the Home feed."
                : `${remainingQuantity(request)} ${remainingQuantity(request) === 1 ? "account" : "accounts"} remaining.`}
            </p>
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground/80">
            <span>{formatRelative(request.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span title={formatDateTime(request.createdAt)}>{formatDateTime(request.createdAt)}</span>
            {request.telegramUsername ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-gold/80">@{request.telegramUsername}</span>
              </>
            ) : null}
          </p>

          {request.note ? (
            <p className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {request.note}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-[15px] font-semibold tabular-nums">
            {formatBdt(request.budgetPerAccountBdt)}
            <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              / account
            </span>
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {formatBdt(totalBudget(request))} total
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onEdit(request)}
          disabled={busy || archived}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Button>

        {request.status === "open" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onStatus(request, "paused")}
            disabled={busy}
          >
            <Pause aria-hidden="true" />
            Pause
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onStatus(request, "open")}
            disabled={busy}
          >
            <Play aria-hidden="true" />
            {request.status === "archived" ? "Restore" : "Reopen"}
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onArchive(request)}
          disabled={busy || archived}
          className="text-red-300/80 hover:bg-red-500/10 hover:text-red-200"
        >
          <Archive aria-hidden="true" />
          {archived ? "Archived" : "Archive"}
        </Button>
      </div>
    </li>
  );
}
