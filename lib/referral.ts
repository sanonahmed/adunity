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
 * Builds the shareable Telegram link for an invite code:
 *
 *   `https://t.me/<bot>?startapp=ref_<code>`
 *
 * This form opens the bot's *main* Mini App (the one behind its menu button)
 * and hands it `ref_<code>` as the signed `start_param`.
 *
 * The `https://t.me/<bot>/<short_name>?startapp=...` form is deliberately not
 * produced. It only resolves when a Mini App was registered under that exact
 * short name with BotFather `/newapp`; when it was not, Telegram answers
 * "bot application not found" and every invite link is dead. The bot-only form
 * has no such failure mode, because it never names an app.
 *
 * Returns null when there is nothing valid to link to.
 */
export function buildInviteLink(
  code: string,
  botUsername: string | null | undefined,
): string | null {
  const bot = botUsername?.trim().replace(/^@/, "");
  const cleanCode = code?.trim().toUpperCase();
  if (!bot || !cleanCode) return null;

  /* A code that `parseReferralCode` would reject yields a link whose
     `start_param` is silently ignored, so refuse to build one. */
  if (cleanCode.length !== REFERRAL_CODE_LENGTH || !/^[A-Z0-9]+$/.test(cleanCode)) {
    return null;
  }

  return `https://t.me/${bot}?startapp=${REFERRAL_START_PREFIX}${cleanCode}`;
}

/** `AB12CD34` -> `AB12 CD34`, for easier reading aloud. */
export function formatReferralCode(code: string): string {
  const clean = code.trim().toUpperCase();
  if (clean.length !== REFERRAL_CODE_LENGTH) return clean;
  return `${clean.slice(0, 4)} ${clean.slice(4)}`;
}
