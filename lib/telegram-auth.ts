import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramUser } from "./telegram";

/**
 * Server-side verification of `WebApp.initData`.
 *
 * Telegram signs the launch payload with the bot token:
 *
 *   secret_key       = HMAC_SHA256(key="WebAppData", data=bot_token)
 *   data_check_string = all "key=value" pairs except `hash`,
 *                       sorted by key, joined with "\n"
 *   expected_hash    = HMAC_SHA256(key=secret_key, data=data_check_string)
 *
 * Comparing `expected_hash` against the supplied `hash` is what stops a client
 * from claiming to be someone else. Never trust `initDataUnsafe` for anything
 * that grants value — it is unsigned and trivially edited.
 */

export const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

export type InitDataFailure =
  | "missing_hash"
  | "missing_auth_date"
  | "bad_signature"
  | "expired"
  | "malformed_user";

export type InitDataOk = {
  ok: true;
  user: TelegramUser | null;
  authDate: Date;
  queryId: string | null;
  startParam: string | null;
};

export type InitDataError = { ok: false; reason: InitDataFailure };

export type InitDataResult = InitDataOk | InitDataError;

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = INIT_DATA_MAX_AGE_SECONDS,
): InitDataResult {
  if (!initData || !botToken) {
    return { ok: false, reason: "bad_signature" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing_hash" };

  /* The check string is every field except `hash`, ordered by key. */
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .map(([key, value]) => `${key}=${value}`)
    .sort((a, b) => (a.split("=")[0] < b.split("=")[0] ? -1 : 1))
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!constantTimeEqualHex(expectedHash, hash)) {
    return { ok: false, reason: "bad_signature" };
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) return { ok: false, reason: "missing_auth_date" };

  const authDateSeconds = Number(authDateRaw);
  if (!Number.isFinite(authDateSeconds)) {
    return { ok: false, reason: "missing_auth_date" };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDateSeconds;
  if (maxAgeSeconds > 0 && ageSeconds > maxAgeSeconds) {
    return { ok: false, reason: "expired" };
  }

  const rawUser = params.get("user");
  let user: TelegramUser | null = null;

  if (rawUser) {
    try {
      const parsed: unknown = JSON.parse(rawUser);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as TelegramUser).id !== "number"
      ) {
        return { ok: false, reason: "malformed_user" };
      }
      user = parsed as TelegramUser;
    } catch {
      return { ok: false, reason: "malformed_user" };
    }
  }

  return {
    ok: true,
    user,
    authDate: new Date(authDateSeconds * 1000),
    queryId: params.get("query_id"),
    startParam: params.get("start_param"),
  };
}
