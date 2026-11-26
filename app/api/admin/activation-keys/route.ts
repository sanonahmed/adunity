import { NextResponse } from "next/server";
import { hasAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { parseActivationKeyInput } from "@/lib/activation-keys";
import { createActivationKey, listActivationKeys } from "@/lib/activation-key-store-postgres";

/** Postgres + cookies require the Node runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function fail(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    { ok: false, error, ...(details ? { details } : {}) },
    { status, headers: NO_STORE },
  );
}

function isDatabaseMissing(error: unknown): boolean {
  return error instanceof Error && error.message === "database_not_configured";
}

/**
 * GET /api/admin/activation-keys  (admin only)
 *
 * Lists issued keys newest first. Digests never leave the server; each row only
 * carries the masked hint the panel displays.
 */
export async function GET() {
  if (!(await hasAdminSession())) return fail("unauthorized", 401);

  try {
    const keys = await listActivationKeys();
    return NextResponse.json({ ok: true, keys }, { headers: NO_STORE });
  } catch (error) {
    if (isDatabaseMissing(error)) return fail("server_not_configured", 503);
    console.error("[activation] list failure", error);
    return fail("store_error", 500);
  }
}

/**
 * POST /api/admin/activation-keys  (admin only)  body: { label? }
 *
 * Generates a key and returns the plaintext exactly once. `digest` is the
 * SHA-256 value an env-only deployment can put in `AUTOBOT_ACTIVATION_KEY_SHA256`;
 * keys issued here are also accepted directly, without a restart.
 */
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return fail("unauthorized", 401);
  if (!hasSameOrigin(request)) return fail("bad_origin", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_json", 400);
  }

  const parsed = parseActivationKeyInput(body);
  if (!parsed.ok) return fail("validation_failed", 422, parsed.errors);

  try {
    const issued = await createActivationKey(parsed.value.label);
    return NextResponse.json({ ok: true, ...issued }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (isDatabaseMissing(error)) return fail("server_not_configured", 503);
    console.error("[activation] create failure", error);
    return fail("store_error", 500);
  }
}
