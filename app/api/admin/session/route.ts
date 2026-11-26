import { NextResponse } from "next/server";
import {
  clearAdminSession,
  getAdminConfig,
  hasAdminSession,
  hasSameOrigin,
  setAdminSession,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 6;

type Attempt = { count: number; resetAt: number };
type ThrottleGlobal = typeof globalThis & { __adunityAdminAttempts?: Map<string, Attempt> };

function attempts(): Map<string, Attempt> {
  const scope = globalThis as ThrottleGlobal;
  return (scope.__adunityAdminAttempts ??= new Map());
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function fail(error: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error }, { status, headers: { ...NO_STORE, ...headers } });
}

/** GET /api/admin/session — used by the login screen to avoid a stale form. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      configured: Boolean(getAdminConfig()),
      authenticated: await hasAdminSession(),
    },
    { headers: NO_STORE },
  );
}

/**
 * POST /api/admin/session  body: { password }
 *
 * Compares a SHA-256 digest in constant time and throttles repeated failures by
 * client address. On success it sets an HttpOnly, SameSite=Strict cookie that
 * every admin mutation requires.
 */
export async function POST(request: Request) {
  const config = getAdminConfig();
  if (!config) return fail("admin_not_configured", 503);
  if (!hasSameOrigin(request)) return fail("bad_origin", 403);

  const key = clientKey(request);
  const now = Date.now();
  const store = attempts();
  if (store.size > 500) {
    for (const [entryKey, entry] of store) if (entry.resetAt <= now) store.delete(entryKey);
  }
  const record = store.get(key);
  if (record && record.resetAt > now && record.count >= MAX_ATTEMPTS) {
    return fail("too_many_attempts", 429, {
      "Retry-After": String(Math.ceil((record.resetAt - now) / 1000)),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_json", 400);
  }

  const password =
    typeof body === "object" && body !== null && "password" in body && typeof body.password === "string"
      ? body.password
      : "";

  if (!password || password.length > 512 || !verifyAdminPassword(password, config.password)) {
    const active = record && record.resetAt > now ? record : { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, { count: active.count + 1, resetAt: active.resetAt });
    return fail("invalid_password", 401);
  }

  store.delete(key);
  await setAdminSession();
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** DELETE /api/admin/session — sign out. */
export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return fail("bad_origin", 403);
  await clearAdminSession();
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
