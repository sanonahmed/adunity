"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildInviteLink,
  type ReferralApiResponse,
  type ReferralSummary,
} from "@/lib/referral";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
const APP_SHORT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME;

/** Server error codes -> readable copy. Unknown codes never leak internals. */
export const REFERRAL_ERROR_COPY: Record<string, string> = {
  server_not_configured:
    "Referral verification is not configured. The app owner must set the server-only Telegram bot token.",
  bad_signature: "Telegram could not verify this launch. Close and reopen AdUnity from Telegram.",
  expired: "This Telegram session has expired. Close and reopen AdUnity to refresh it.",
  missing_hash: "Telegram did not provide a verifiable launch. Reopen AdUnity from Telegram.",
  missing_auth_date:
    "Telegram did not provide a verifiable launch time. Reopen AdUnity from Telegram.",
  malformed_user:
    "Telegram did not provide a usable profile. Reopen AdUnity from your personal Telegram account.",
  store_error: "Referral storage is temporarily unavailable. Please try again shortly.",
};

export type ReferralState = {
  summary: ReferralSummary | null;
  inviteLink: string | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

/**
 * Loads the caller's referral record once per launch.
 *
 * This runs at app boot rather than when the Referral tab opens: an invitee
 * lands on Home when they follow `?startapp=ref_<code>`, and their attribution
 * must be recorded even if they never visit the Referral tab. The request is
 * idempotent, so a retry can never double count.
 *
 * `initData` is the only credential sent. The server derives the account, the
 * invite code and all counts from that signed payload.
 */
export function useReferral(initData: string): ReferralState {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!initData) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as ReferralApiResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.ok ? "store_error" : payload.error);
        }
        setSummary(payload.referral);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(
          cause instanceof Error
            ? REFERRAL_ERROR_COPY[cause.message] ??
                "Could not load referral data. Please try again."
            : "Could not load referral data. Please try again.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [initData, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    summary,
    inviteLink: summary
      ? buildInviteLink(summary.code, BOT_USERNAME, APP_SHORT_NAME)
      : null,
    loading,
    error,
    retry,
  };
}
