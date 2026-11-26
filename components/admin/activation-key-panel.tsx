"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CircleAlert,
  CircleCheck,
  Copy,
  KeyRound,
  Loader2,
  ShieldOff,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACTIVATION_KEY_LIMITS,
  formatActivationKeyUse,
  isActivationKeyActive,
  type ActivationKey,
} from "@/lib/activation-keys";
import { formatDateTime } from "@/lib/market";
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from "./field-styles";

type Issued = { key: ActivationKey; secret: string; digest: string };

type ListResponse = { ok?: boolean; keys?: ActivationKey[]; error?: string };
type IssueResponse = Issued & { ok?: boolean; error?: string; details?: { label?: string } };
type ItemResponse = { ok?: boolean; key?: ActivationKey; error?: string };

const ERROR_COPY: Record<string, string> = {
  unauthorized: "Your admin session expired. Reload the page to sign in again.",
  bad_origin: "Request blocked: this action must come from the admin page.",
  server_not_configured: "Database access isn't configured on this server.",
  store_error: "The database did not accept that change. Try again.",
  not_found: "That key was already revoked. Refresh the list.",
  invalid_json: "The request was malformed. Try again.",
};

export function ActivationKeyPanel({
  initialKeys = null,
  reloadKey = 0,
}: {
  initialKeys?: ActivationKey[] | null;
  reloadKey?: number;
}) {
  const [keys, setKeys] = useState<ActivationKey[] | null>(initialKeys);
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<"key" | "digest" | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialKeys && reloadKey === 0) return;

    const controller = new AbortController();
    void fetch("/api/admin/activation-keys", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as ListResponse | null;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.keys)) {
          throw new Error(payload?.error ?? "store_error");
        }
        setKeys(payload.keys);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        const code = cause instanceof Error ? cause.message : "store_error";
        setNotice({ tone: "error", text: ERROR_COPY[code] ?? "Could not load activation keys." });
      });

    return () => controller.abort();
  }, [initialKeys, reloadKey]);

  async function copy(value: string, kind: "key" | "digest") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setNotice({
        tone: "error",
        text: "Copying was blocked by the browser — select the text and copy it manually.",
      });
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setLabelError("");
    setNotice(null);
    const trimmed = label.trim();
    if (trimmed.length > ACTIVATION_KEY_LIMITS.label) {
      setLabelError(`Keep the label under ${ACTIVATION_KEY_LIMITS.label} characters.`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/activation-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as IssueResponse | null;

      if (!response.ok || !payload?.ok || !payload.key || !payload.secret) {
        if (response.status === 422 && payload?.details?.label) {
          setLabelError(payload.details.label);
        } else {
          setNotice({
            tone: "error",
            text: ERROR_COPY[payload?.error ?? ""] ?? "Could not generate a key. Please retry.",
          });
        }
        return;
      }

      setIssued({ key: payload.key, secret: payload.secret, digest: payload.digest });
      setKeys((current) => [payload.key as ActivationKey, ...(current ?? [])]);
      setLabel("");
      setNotice({ tone: "success", text: "Activation key generated. Copy it now — it is shown once." });
    } catch {
      setNotice({ tone: "error", text: "Network error. Check your connection and retry." });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ActivationKey) {
    const confirmed = window.confirm(
      `Revoke "${key.label}"? Anyone holding this key will no longer be able to activate Auto Bot.`,
    );
    if (!confirmed) return;

    setRevokingId(key.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/activation-keys/${encodeURIComponent(key.id)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as ItemResponse | null;
      if (!response.ok || !payload?.ok || !payload.key) {
        throw new Error(payload?.error ?? "store_error");
      }

      const saved = payload.key;
      setKeys((current) => (current ?? []).map((item) => (item.id === saved.id ? saved : item)));
      setIssued((current) => (current && current.key.id === saved.id ? null : current));
      setNotice({ tone: "success", text: "Key revoked. It no longer unlocks Auto Bot." });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "store_error";
      setNotice({ tone: "error", text: ERROR_COPY[code] ?? "Could not revoke the key." });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="mt-8">
      <div>
        <p className="eyebrow">Auto Bot</p>
        <h2 className="mt-1 flex items-center gap-2 text-[16px] font-semibold tracking-[-0.02em]">
          <KeyRound className="size-4 text-gold" aria-hidden="true" />
          Activation keys
        </h2>
        <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-muted-foreground">
          Buyers unlock the Auto Bot panel with a key issued here. Only a SHA-256 digest is stored,
          so each key is shown exactly once; revoke it as soon as it is no longer needed.
        </p>
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

      <form onSubmit={generate} noValidate className="glass mt-4 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label className={LABEL_CLASS} htmlFor="activation-key-label">
              Label <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="activation-key-label"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setLabelError("");
              }}
              maxLength={ACTIVATION_KEY_LIMITS.label}
              placeholder="e.g. Rafi — March batch"
              className={FIELD_CLASS}
              aria-invalid={Boolean(labelError)}
              aria-describedby="activation-key-label-help"
            />
            {labelError ? (
              <p className={ERROR_CLASS}>{labelError}</p>
            ) : (
              <p id="activation-key-label-help" className="mt-1 text-[10px] text-muted-foreground/75">
                For your eyes only — buyers never see the label.
              </p>
            )}
          </div>
          <Button type="submit" size="sm" disabled={busy} className="h-[38px] shrink-0">
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            {busy ? "Generating…" : "Generate key"}
          </Button>
        </div>
      </form>

      {issued ? (
        <div className="mt-3 rounded-2xl border border-gold/25 bg-gold-soft p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <p className="text-[12.5px] font-semibold text-gold">
                  Copy this key now — it is shown once
                </p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-gold/80">
                  Only a SHA-256 digest is stored, so the key cannot be displayed again. If it is
                  lost, revoke it and generate a new one.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setIssued(null)}
              aria-label="Dismiss the new key"
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-3 rounded-xl border border-gold/20 bg-black/30 px-3 py-2.5">
            <p className="select-all break-all font-mono text-[14px] font-semibold tracking-[0.05em] text-gold">
              {issued.secret}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => copy(issued.secret, "key")}>
              <Copy aria-hidden="true" />
              {copied === "key" ? "Copied" : "Copy key"}
            </Button>
            <span className="text-[10px] text-gold/75">{issued.key.label}</span>
          </div>

          <details className="mt-3 rounded-xl border border-gold/15 bg-black/20 px-3 py-2">
            <summary className="cursor-pointer text-[10.5px] font-semibold text-gold/85">
              Env-only fallback (no database key)
            </summary>
            <p className="mt-1.5 text-[10px] leading-relaxed text-gold/75">
              Set <span className="font-mono">AUTOBOT_ACTIVATION_KEY_SHA256</span> in{" "}
              <span className="font-mono">.env.local</span> and restart. Keys generated above work
              immediately and need no restart.
            </p>
            <code className="mt-1.5 block select-all break-all font-mono text-[10px] leading-relaxed text-gold/80">
              {issued.digest}
            </code>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1.5"
              onClick={() => copy(issued.digest, "digest")}
            >
              <Copy aria-hidden="true" />
              {copied === "digest" ? "Copied" : "Copy digest"}
            </Button>
          </details>
        </div>
      ) : null}


      <div className="mt-4">
        {keys === null ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1].map((index) => (
              <div key={index} className="glass rounded-2xl px-4 py-3">
                <span className="block h-3 w-40 animate-pulse rounded-full bg-white/[0.07]" />
                <span className="mt-2 block h-2.5 w-24 animate-pulse rounded-full bg-white/[0.05]" />
              </div>
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.09] px-5 py-8 text-center">
            <KeyRound className="mx-auto size-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-2 text-[13px] font-medium">No keys yet</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Generate one above and send it to a buyer. It stays valid until you revoke it.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {keys.map((key) => {
              const active = isActivationKeyActive(key);
              return (
                <li key={key.id} className="glass rounded-2xl px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">
                          {key.label}
                        </p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${
                            active
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                              : "border-white/10 bg-white/[0.04] text-muted-foreground"
                          }`}
                        >
                          {active ? "active" : "revoked"}
                        </span>
                      </div>
                      <p className="mt-1 select-all font-mono text-[11.5px] tracking-[0.02em] text-gold/85">
                        {key.hint}
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                        Created {formatDateTime(key.createdAt)} · {formatActivationKeyUse(key)}
                        {key.lastUsedAt ? ` · last ${formatDateTime(key.lastUsedAt)}` : ""}
                        {key.revokedAt ? ` · revoked ${formatDateTime(key.revokedAt)}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => revoke(key)}
                      disabled={!active || revokingId === key.id}
                      className="shrink-0 self-start text-red-300/80 hover:bg-red-500/10 hover:text-red-200"
                    >
                      {revokingId === key.id ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <ShieldOff aria-hidden="true" />
                      )}
                      {active ? "Revoke" : "Revoked"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/75">
        Auto Bot is a simulation. Keys gate demo screens only — no Gmail account, credential or
        payment is created or stored.
      </p>
    </section>
  );
}
