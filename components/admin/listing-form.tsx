"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BUYER_REQUIREMENTS,
  BUYER_STATUSES,
  MARKET_LIMITS,
  formatBdt,
  fulfillmentPercent,
  remainingQuantity,
  type BuyerErrors,
  type BuyerInput,
  type BuyerRequest,
  type BuyerRequirement,
  type BuyerStatus,
} from "@/lib/market";
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from "./field-styles";

type Draft = {
  buyer: string;
  verified: boolean;
  item: string;
  quantity: string;
  fulfilled: string;
  requirement: BuyerRequirement;
  budgetPerAccountBdt: string;
  note: string;
  telegramUsername: string;
  status: BuyerStatus;
};

function draftFrom(request?: BuyerRequest | null): Draft {
  return {
    buyer: request?.buyer ?? "",
    verified: request?.verified ?? false,
    item: request?.item ?? "Gmail accounts",
    quantity: request ? String(request.quantity) : "",
    fulfilled: request ? String(request.fulfilled) : "0",
    requirement: request?.requirement ?? "Fresh",
    budgetPerAccountBdt: request ? String(request.budgetPerAccountBdt) : "",
    note: request?.note ?? "",
    telegramUsername: request?.telegramUsername ?? "",
    status: request?.status ?? "open",
  };
}

export function ListingForm({
  initial,
  busy,
  serverErrors,
  onSubmit,
  onCancel,
}: {
  initial?: BuyerRequest | null;
  busy: boolean;
  serverErrors: BuyerErrors | null;
  onSubmit: (values: BuyerInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [clientErrors, setClientErrors] = useState<BuyerErrors>({});
  const shown: BuyerErrors = { ...serverErrors, ...clientErrors };

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setClientErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const next: BuyerErrors = {};
    if (draft.buyer.trim().length < 2) next.buyer = "Enter a buyer name (2+ characters).";
    if (draft.item.trim().length < 2) next.item = "Enter what the buyer wants.";
    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MARKET_LIMITS.quantityMax) {
      next.quantity = `Use a whole number from 1 to ${MARKET_LIMITS.quantityMax}.`;
    }
    const fulfilled = draft.fulfilled.trim() === "" ? Number.NaN : Number(draft.fulfilled);
    if (!Number.isInteger(fulfilled) || fulfilled < 0) {
      next.fulfilled = "Use a whole number of 0 or more.";
    } else if (Number.isInteger(quantity) && fulfilled > quantity) {
      next.fulfilled = `Delivered cannot exceed the quantity (${quantity}).`;
    }
    const budget = Number(draft.budgetPerAccountBdt);
    if (!Number.isInteger(budget) || budget < 1 || budget > MARKET_LIMITS.budgetMax) {
      next.budgetPerAccountBdt = `Use a whole number from 1 to ${MARKET_LIMITS.budgetMax}.`;
    }
    setClientErrors(next);
    if (Object.keys(next).length > 0) return;

    void onSubmit({
      buyer: draft.buyer.trim(),
      verified: draft.verified,
      item: draft.item.trim(),
      quantity,
      fulfilled,
      requirement: draft.requirement,
      budgetPerAccountBdt: budget,
      note: draft.note.trim() || null,
      telegramUsername: draft.telegramUsername.trim().replace(/^@/, "") || null,
      status: draft.status,
    });
  }

  const total = Number(draft.quantity) * Number(draft.budgetPerAccountBdt);
  const progress =
    draft.quantity.trim() !== "" &&
    draft.fulfilled.trim() !== "" &&
    Number.isInteger(Number(draft.quantity)) &&
    Number.isInteger(Number(draft.fulfilled)) &&
    Number(draft.fulfilled) >= 0 &&
    Number(draft.fulfilled) <= Number(draft.quantity)
      ? {
          quantity: Number(draft.quantity),
          fulfilled: Number(draft.fulfilled),
        }
      : null;

  return (
    <form onSubmit={submit} noValidate className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{initial ? "Edit listing" : "New listing"}</p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">
            {initial ? initial.buyer : "Publish a buyer request"}
          </h2>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          <X aria-hidden="true" />
          Close
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor="listing-buyer">
            Buyer name
          </label>
          <input
            id="listing-buyer"
            value={draft.buyer}
            onChange={(event) => update("buyer", event.target.value)}
            maxLength={MARKET_LIMITS.buyer}
            placeholder="e.g. Rafi Ahmed"
            className={FIELD_CLASS}
            aria-invalid={Boolean(shown.buyer)}
          />
          {shown.buyer ? <p className={ERROR_CLASS}>{shown.buyer}</p> : null}
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="listing-item">
            Wants
          </label>
          <input
            id="listing-item"
            value={draft.item}
            onChange={(event) => update("item", event.target.value)}
            maxLength={MARKET_LIMITS.item}
            placeholder="Gmail accounts"
            className={FIELD_CLASS}
            aria-invalid={Boolean(shown.item)}
          />
          {shown.item ? <p className={ERROR_CLASS}>{shown.item}</p> : null}
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="listing-quantity">
            Quantity
          </label>
          <input
            id="listing-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={MARKET_LIMITS.quantityMax}
            value={draft.quantity}
            onChange={(event) => update("quantity", event.target.value)}
            placeholder="25"
            className={FIELD_CLASS}
            aria-invalid={Boolean(shown.quantity)}
          />
          {shown.quantity ? <p className={ERROR_CLASS}>{shown.quantity}</p> : null}
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="listing-fulfilled">
            Delivered so far
          </label>
          <input
            id="listing-fulfilled"
            type="number"
            inputMode="numeric"
            min={0}
            max={MARKET_LIMITS.quantityMax}
            value={draft.fulfilled}
            onChange={(event) => update("fulfilled", event.target.value)}
            placeholder="0"
            className={FIELD_CLASS}
            aria-invalid={Boolean(shown.fulfilled)}
          />
          {shown.fulfilled ? (
            <p className={ERROR_CLASS}>{shown.fulfilled}</p>
          ) : progress ? (
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {progress.fulfilled} of {progress.quantity} delivered ·{" "}
              {fulfillmentPercent(progress)}% · {remainingQuantity(progress)} remaining
            </p>
          ) : null}
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="listing-budget">
            Budget per account (BDT)
          </label>
          <input
            id="listing-budget"
            type="number"
            inputMode="numeric"
            min={1}
            max={MARKET_LIMITS.budgetMax}
            value={draft.budgetPerAccountBdt}
            onChange={(event) => update("budgetPerAccountBdt", event.target.value)}
            placeholder="180"
            className={FIELD_CLASS}
            aria-invalid={Boolean(shown.budgetPerAccountBdt)}
          />
          {shown.budgetPerAccountBdt ? (
            <p className={ERROR_CLASS}>{shown.budgetPerAccountBdt}</p>
          ) : null}
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="listing-requirement">
            Requirement
          </label>
          <select
            id="listing-requirement"
            value={draft.requirement}
            onChange={(event) => update("requirement", event.target.value as BuyerRequirement)}
            className={FIELD_CLASS}
          >
            {BUYER_REQUIREMENTS.map((option) => (
              <option key={option} value={option} className="bg-[#0b0d13]">
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="listing-status">
            Status
          </label>
          <select
            id="listing-status"
            value={draft.status}
            onChange={(event) => update("status", event.target.value as BuyerStatus)}
            className={FIELD_CLASS}
          >
            {BUYER_STATUSES.map((option) => (
              <option key={option} value={option} className="bg-[#0b0d13]">
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="listing-telegram">
            Telegram handle <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="listing-telegram"
            value={draft.telegramUsername}
            onChange={(event) => update("telegramUsername", event.target.value)}
            maxLength={MARKET_LIMITS.telegramUsername + 1}
            placeholder="@rafi"
            className={FIELD_CLASS}
            aria-invalid={Boolean(shown.telegramUsername)}
          />
          {shown.telegramUsername ? (
            <p className={ERROR_CLASS}>{shown.telegramUsername}</p>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 self-end rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <input
            type="checkbox"
            checked={draft.verified}
            onChange={(event) => update("verified", event.target.checked)}
            className="size-4 accent-[#e6d2a8]"
          />
          <span className="text-[12px] text-foreground/85">Show verified badge</span>
        </label>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor="listing-note">
            Internal note <span className="normal-case tracking-normal">(admin only)</span>
          </label>
          <textarea
            id="listing-note"
            value={draft.note}
            onChange={(event) => update("note", event.target.value)}
            maxLength={MARKET_LIMITS.note}
            rows={2}
            placeholder="Payment terms, delivery window, follow-up owner…"
            className={`${FIELD_CLASS} resize-y`}
            aria-invalid={Boolean(shown.note)}
          />
          {shown.note ? <p className={ERROR_CLASS}>{shown.note}</p> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <p className="text-[11px] text-muted-foreground">
          Total budget{" "}
          <span className="font-semibold tabular-nums text-foreground/90">
            {formatBdt(Number.isFinite(total) ? total : 0)}
          </span>
          {draft.status !== "open" ? " · hidden from Home until open" : ""}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {busy ? "Saving…" : initial ? "Save changes" : "Publish listing"}
          </Button>
        </div>
      </div>
    </form>
  );
}
