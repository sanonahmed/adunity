"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildInviteLink,
  type ReferralApiResponse,
  type ReferralSummary,
} from "@/lib/referral";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

/** Server error codes -> readable copy. Unknown codes never leak internals. */
export const REFERRAL_ERROR_COPY: Record<string, string> = {
  server_not_configured:
    "Referral rewards are temporarily unavailable. Please try again in a moment.",
  bad_signature: "We couldn't verify this Telegram session. Reopen AdUnity and try again.",
  expired: "This Telegram session has expired. Close and reopen AdUnity to refresh it.",
  missing_hash: "We couldn't verify this Telegram session. Reopen AdUnity and try again.",
  missing_auth_date:
    "We couldn't verify this Telegram session. Reopen AdUnity and try again.",
  malformed_user:
    "Open AdUnity from your personal Telegram account and try again.",
  store_error: "Referral data is temporarily unavailable. Please try again shortly.",
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
  const loadedInitData = useRef("");

  useEffect(() => {
    /* Clear a previous account's invitees when Telegram switches accounts or
       the app leaves Telegram, but retain the current summary during refresh. */
    if (loadedInitData.current !== initData) {
      loadedInitData.current = initData;
      setSummary(null);
      setError(null);
    }
    if (!initData) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

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
    inviteLink: summary ? buildInviteLink(summary.code, BOT_USERNAME) : null,
    loading,
    error,
    retry,
  };
}
