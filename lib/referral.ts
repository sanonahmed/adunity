/**
 * Referral rules shared by the server route and the client panel.
 *
 * Deliberately dependency-free and side-effect-free: code parsing, link
 * building and label formatting must behave identically wherever they run.
 *
 * Attribution comes from Telegram's *signed* `start_param`, never from a
 * query string the client could edit. Values look like `ref_AB12CD34`.
 */

/** Telegram only allows [A-Za-z0-9_-] in a start parameter. */
export const REFERRAL_START_PREFIX = "ref_";

/** 8 characters from a 31-symbol alphabet — unambiguous, ~2^40 space. */
export const REFERRAL_CODE_LENGTH = 8;

export type ReferralRecord = {
  /** Privacy-safe generic label; invitee names are never stored or shared. */
  name: string;
  joinedAt: string;
};

export type ReferralSummary = {
  code: string;
  invitedCount: number;
  /** When this account was first recorded by the server (ISO 8601). */
  joinedAt: string;
  recent: ReferralRecord[];
  /**
   * There is no reward or payout policy in the product yet, so earnings are
   * never derived. The panel states this instead of showing a number.
   */
  rewardsConfigured: false;
};

export type ReferralApiSuccess = { ok: true; referral: ReferralSummary };

export type ReferralApiFailure = {
  ok: false;
  error:
    | "server_not_configured"
    | "missing_init_data"
    | "invalid_json"
    | "bad_signature"
    | "expired"
    | "missing_hash"
    | "missing_auth_date"
    | "malformed_user"
    | "store_error";
};

export type ReferralApiResponse = ReferralApiSuccess | ReferralApiFailure;

/** `ref_AB12CD34` -> `"AB12CD34"`; anything else -> null. */
export function parseReferralCode(startParam: string | null | undefined): string | null {
  if (!startParam) return null;

  const trimmed = startParam.trim();
  if (!trimmed.toLowerCase().startsWith(REFERRAL_START_PREFIX)) return null;

  const code = trimmed.slice(REFERRAL_START_PREFIX.length).toUpperCase();
  if (code.length !== REFERRAL_CODE_LENGTH) return null;
  if (!/^[A-Z0-9]+$/.test(code)) return null;

  return code;
}

/**
 * Builds the shareable Telegram link for an invite code.
 *
 *   with a short name: `https://t.me/<bot>/<app>?startapp=ref_<code>`
 *   without one:       `https://t.me/<bot>?startapp=ref_<code>`
 *
 * Both are documented direct links, and both deliver the value to the Mini App
 * as the signed `start_param`. A short name is optional: only the bot username
 * is required, so a bot whose Mini App is opened from its menu button still
 * gets working invites. Returns null when there is nothing valid to link to.
 */
export function buildInviteLink(
  code: string,
  botUsername: string | null | undefined,
  appShortName?: string | null,
): string | null {
  const bot = botUsername?.trim().replace(/^@/, "");
  const cleanCode = code?.trim().toUpperCase();
  if (!bot || !cleanCode) return null;

  const startParam = `${REFERRAL_START_PREFIX}${cleanCode}`;
  const app = appShortName?.trim();

  return app
    ? `https://t.me/${bot}/${app}?startapp=${startParam}`
    : `https://t.me/${bot}?startapp=${startParam}`;
}

/** `AB12CD34` -> `AB12 CD34`, for easier reading aloud. */
export function formatReferralCode(code: string): string {
  const clean = code.trim().toUpperCase();
  if (clean.length !== REFERRAL_CODE_LENGTH) return clean;
  return `${clean.slice(0, 4)} ${clean.slice(4)}`;
}
