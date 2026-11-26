import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ACTIVATION_KEY_LIMITS, normalizeActivationKey } from "@/lib/activation-keys";
import {
  sha256Hex,
  verifyActivationKey,
} from "@/lib/activation-key-store-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type Attempt = { count: number; resetAt: number };
type ThrottleGlobal = typeof globalThis & {
  __adunityActivationAttempts?: Map<string, Attempt>;
};

function fail(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function attempts(): Map<string, Attempt> {
  const scope = globalThis as ThrottleGlobal;
  return (scope.__adunityActivationAttempts ??= new Map());
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

/** `AUTOBOT_ACTIVATION_KEY_SHA256`, when it holds a real digest. */
function envDigest(): string | null {
  const configured = process.env.AUTOBOT_ACTIVATION_KEY_SHA256?.trim().toLowerCase();
  return configured && /^[a-f0-9]{64}$/.test(configured) ? configured : null;
}

function matchesDigest(candidate: string, expected: string): boolean {
  return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(expected, "hex"));
}

/**
 * Validates an activation key.
 *
 * Keys generated in `/admin` are looked up by digest in Postgres, so a new key
 * works immediately and a revoked one stops working immediately. A digest in
 * `AUTOBOT_ACTIVATION_KEY_SHA256` is still honoured for env-only deployments;
 * it matches the key exactly or its normalized (uppercase, no dashes) form, so
 * the value the admin panel shows can be pasted straight into `.env.local`.
 *
 * Repeated failures from one client address are throttled, and the response
 * never reveals whether a key existed, was revoked or was malformed.
 */
export async function POST(request: Request) {
  const expectedEnv = envDigest();
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  if (!expectedEnv && !databaseConfigured) return fail("server_not_configured", 503);

  const store = attempts();
  const now = Date.now();
  if (store.size > 500) {
    for (const [entryKey, entry] of store) if (entry.resetAt <= now) store.delete(entryKey);
  }
  const client = clientKey(request);
  const record = store.get(client);
  if (record && record.resetAt > now && record.count >= MAX_ATTEMPTS) {
    return fail("too_many_attempts", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", 400);
  }

  const key =
    typeof body === "object" && body !== null && "key" in body && typeof body.key === "string"
      ? body.key.trim()
      : "";

  let matched = false;
  if (key && key.length <= ACTIVATION_KEY_LIMITS.raw) {
    if (databaseConfigured) {
      try {
        matched = Boolean(await verifyActivationKey(key));
      } catch (error) {
        console.error("[activation] store failure", error);
      }
    }

    if (!matched && expectedEnv) {
      const normalized = normalizeActivationKey(key);
      matched =
        matchesDigest(sha256Hex(key), expectedEnv) ||
        (normalized !== key && matchesDigest(sha256Hex(normalized), expectedEnv));
    }
  }

  if (!matched) {
    const active = record && record.resetAt > now ? record : { count: 0, resetAt: now + WINDOW_MS };
    store.set(client, { count: active.count + 1, resetAt: active.resetAt });
    return fail("invalid_key", 401);
  }

  store.delete(client);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return fail("method_not_allowed", 405);
}
