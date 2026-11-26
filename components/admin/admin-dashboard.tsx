"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CircleAlert,
  CircleCheck,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActivationKey } from "@/lib/activation-keys";
import { formatBdt, type BuyerErrors, type BuyerInput, type BuyerRequest, type BuyerStatus } from "@/lib/market";
import { FIELD_CLASS } from "./field-styles";
import { ActivationKeyPanel } from "./activation-key-panel";
import { ListingForm } from "./listing-form";
import { ListingRow } from "./listing-row";

type Filter = "all" | BuyerStatus;

const STATUS_FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "paused", label: "Paused" },
  { id: "archived", label: "Archived" },
];

type ListResponse = { ok?: boolean; buyers?: BuyerRequest[]; error?: string };
type ItemResponse = {
  ok?: boolean;
  buyer?: BuyerRequest;
  error?: string;
  details?: BuyerErrors;
};

const ERROR_COPY: Record<string, string> = {
  unauthorized: "Your admin session expired. Reload the page to sign in again.",
  bad_origin: "Request blocked: this action must come from the admin page.",
  store_error: "The database did not accept that change. Try again.",
  server_not_configured: "Database access isn't configured on this server.",
  not_found: "That listing no longer exists. Refresh the list.",
  invalid_json: "The request was malformed. Try again.",
};

export function AdminDashboard({
  initialBuyers = null,
  initialKeys = null,
}: {
  initialBuyers?: BuyerRequest[] | null;
  initialKeys?: ActivationKey[] | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement | null>(null);
  const [buyers, setBuyers] = useState<BuyerRequest[] | null>(initialBuyers);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BuyerRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<BuyerErrors | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Filter>("all");

  useEffect(() => {
    if (initialBuyers && reloadKey === 0) return;

    const controller = new AbortController();
    setError(null);

    void fetch("/api/market/buyers?scope=admin", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as ListResponse;
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok || !payload.ok || !Array.isArray(payload.buyers)) {
          throw new Error(payload.error ?? "store_error");
        }
        setBuyers(payload.buyers);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        const code = cause instanceof Error ? cause.message : "store_error";
        setError(ERROR_COPY[code] ?? "Could not load listings. Please retry.");
      });

    return () => controller.abort();
  }, [initialBuyers, reloadKey]);

  useEffect(() => {
    if (formOpen) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [formOpen, editing]);

  const stats = useMemo(() => {
    const list = buyers ?? [];
    const open = list.filter((item) => item.status === "open");
    const accounts = open.reduce((sum, item) => sum + item.quantity, 0);
    const delivered = open.reduce((sum, item) => sum + item.fulfilled, 0);
    const average = open.length
      ? Math.round(open.reduce((sum, item) => sum + item.budgetPerAccountBdt, 0) / open.length)
      : 0;
    return {
      open: open.length,
      paused: list.filter((item) => item.status === "paused").length,
      archived: list.filter((item) => item.status === "archived").length,
      accounts,
      delivered,
      average,
    };
  }, [buyers]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (buyers ?? []).filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (!term) return true;
      return [item.buyer, item.item, item.requirement, item.note ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [buyers, query, status]);

  const openForm = useCallback((request: BuyerRequest | null) => {
    setEditing(request);
    setServerErrors(null);
    setFormOpen(true);
  }, []);

  async function saveListing(input: BuyerInput): Promise<boolean> {
    setSaving(true);
    setServerErrors(null);
    const url = editing
      ? `/api/market/buyers/${encodeURIComponent(editing.id)}`
      : "/api/market/buyers";

    try {
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as ItemResponse | null;

      if (!response.ok || !payload?.ok || !payload.buyer) {
        if (response.status === 422 && payload?.details) {
          setServerErrors(payload.details);
        } else {
          setNotice({
            tone: "error",
            text: ERROR_COPY[payload?.error ?? ""] ?? "Could not save the listing. Please retry.",
          });
        }
        return false;
      }

      const saved = payload.buyer;
      setBuyers((current) => {
        const list = current ?? [];
        return editing ? list.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...list];
      });
      setFormOpen(false);
      setEditing(null);
      setNotice({ tone: "success", text: editing ? "Listing updated." : "Listing published." });
      return true;
    } catch {
      setNotice({ tone: "error", text: "Network error. Check your connection and retry." });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(request: BuyerRequest, next: BuyerStatus) {
    setBusyId(request.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/market/buyers/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as ItemResponse | null;
      if (!response.ok || !payload?.ok || !payload.buyer) {
        throw new Error(payload?.error ?? "store_error");
      }
      const saved = payload.buyer;
      setBuyers((current) => (current ?? []).map((item) => (item.id === saved.id ? saved : item)));
      setNotice({ tone: "success", text: `Listing ${next === "open" ? "opened" : "paused"}.` });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "store_error";
      setNotice({ tone: "error", text: ERROR_COPY[code] ?? "Could not update the listing." });
    } finally {
      setBusyId(null);
    }
  }

  async function archiveListing(request: BuyerRequest) {
    const confirmed = window.confirm(
      `Archive ${request.buyer}'s request? It leaves the Home feed but stays in this list.`,
    );
    if (!confirmed) return;

    setBusyId(request.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/market/buyers/${encodeURIComponent(request.id)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as ItemResponse | null;
      if (!response.ok || !payload?.ok || !payload.buyer) {
        throw new Error(payload?.error ?? "store_error");
      }
      const saved = payload.buyer;
      setBuyers((current) => (current ?? []).map((item) => (item.id === saved.id ? saved : item)));
      setNotice({ tone: "success", text: "Listing archived." });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "store_error";
      setNotice({ tone: "error", text: ERROR_COPY[code] ?? "Could not archive the listing." });
    } finally {
      setBusyId(null);
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE", cache: "no-store" }).catch(
      () => undefined,
    );
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl border border-gold/15 bg-gold-soft text-gold">
              <Store className="size-4" aria-hidden="true" />
            </span>
            <Badge variant="muted">Admin</Badge>
          </div>
          <p className="eyebrow mt-4">AdUnity operations</p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.035em]">
            Market operations
          </h1>
          <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">
            Publish, edit and pause the buyer requests shown on Home, and issue Auto Bot activation
            keys. Changes go live as soon as they are saved — no deploy needed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={signOut}>
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mt-6 flex items-start gap-2 rounded-2xl border border-gold/15 bg-gold-soft px-3.5 py-3 text-[11.5px] leading-relaxed text-gold/90">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Presentation only. Listings describe fictional requests; this panel never stores
          credentials or handles payment or delivery of accounts.
        </span>
      </div>

      {notice ? (
        <div
          role="status"
          className={`mt-4 flex items-start gap-2 rounded-2xl border px-3.5 py-3 text-[11.5px] leading-relaxed ${
            notice.tone === "success"
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/25 bg-red-500/10 text-red-200"
          }`}
        >
          {notice.tone === "success" ? (
            <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      ) : null}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open", value: stats.open, hint: "live on Home" },
          { label: "Accounts wanted", value: stats.accounts, hint: `${stats.delivered} delivered` },
          { label: "Avg. budget", value: formatBdt(stats.average), hint: "per account" },
          { label: "Archived", value: stats.archived, hint: `${stats.paused} paused` },
        ].map((card) => (
          <div key={card.label} className="glass rounded-2xl px-4 py-3.5">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-1.5 text-[19px] font-semibold tabular-nums tracking-[-0.02em]">
              {card.value}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/75">{card.hint}</p>
          </div>
        ))}
      </section>

      <ActivationKeyPanel initialKeys={initialKeys} reloadKey={reloadKey} />

      <div ref={formRef} className="mt-6 scroll-mt-6">
        {formOpen ? (
          <ListingForm
            key={editing?.id ?? "new-listing"}
            initial={editing}
            busy={saving}
            serverErrors={serverErrors}
            onSubmit={saveListing}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
              setServerErrors(null);
            }}
          />
        ) : null}
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Feed</p>
            <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">
              All listings{" "}
              {buyers ? <span className="text-muted-foreground">({buyers.length})</span> : null}
            </h2>
          </div>
          <Button type="button" size="sm" onClick={() => openForm(null)}>
            <Plus aria-hidden="true" />
            New listing
          </Button>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search buyer, item or note…"
              aria-label="Search listings"
              className={`${FIELD_CLASS} pl-9`}
            />
          </div>

          <div
            className="scrollbar-hide flex gap-1.5 overflow-x-auto"
            role="group"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((option) => {
              const selected = option.id === status;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatus(option.id)}
                  aria-pressed={selected}
                  className={`tap shrink-0 rounded-full border px-3 py-1.5 text-[10.5px] font-semibold transition-colors ${
                    selected
                      ? "border-gold/30 bg-gold-soft text-gold"
                      : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:border-white/15 hover:text-foreground/80"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="glass mt-4 rounded-2xl p-5 text-center">
            <p className="text-[12.5px] text-foreground/90">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : buyers === null ? (
          <div className="mt-4 space-y-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <span className="block h-3 w-32 animate-pulse rounded-full bg-white/[0.07]" />
                    <span className="block h-2.5 w-48 animate-pulse rounded-full bg-white/[0.05]" />
                  </div>
                  <Loader2 className="size-4 animate-spin text-muted-foreground/60" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/[0.09] px-5 py-10 text-center">
            <Archive className="mx-auto size-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-2 text-[13px] font-medium">
              {buyers.length === 0 ? "No listings yet" : "No listings match this view"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {buyers.length === 0
                ? "Publish the first request and it will appear on Home immediately."
                : "Try a different status or clear the search term."}
            </p>
            {buyers.length === 0 ? (
              <Button type="button" size="sm" className="mt-4" onClick={() => openForm(null)}>
                <Plus aria-hidden="true" />
                Create the first listing
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {filtered.map((request) => (
              <ListingRow
                key={request.id}
                request={request}
                busy={busyId === request.id}
                onEdit={openForm}
                onStatus={changeStatus}
                onArchive={archiveListing}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 text-[10.5px] text-muted-foreground">
        <span>Admin session · expires after 8 hours</span>
        <span>AdUnity market operations</span>
      </footer>
    </main>
  );
}
