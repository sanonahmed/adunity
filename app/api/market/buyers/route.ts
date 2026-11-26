import { NextResponse } from "next/server";
import { hasAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { parseBuyerInput } from "@/lib/market";
import { createBuyer, listBuyers } from "@/lib/market-store-postgres";

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
 * GET /api/market/buyers
 *
 * Public callers get open listings with contact details stripped. A signed-in
 * admin gets every listing, including paused and archived rows.
 */
export async function GET(request: Request) {
  const wantsAdmin = new URL(request.url).searchParams.get("scope") === "admin";
  if (wantsAdmin && !(await hasAdminSession())) return fail("unauthorized", 401);

  try {
    const scope = wantsAdmin ? "admin" : "public";
    const buyers = await listBuyers(scope);
    return NextResponse.json(
      { ok: true, scope, buyers },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (isDatabaseMissing(error)) return fail("server_not_configured", 503);
    console.error("[market] list failure", error);
    return fail("store_error", 500);
  }
}

/**
 * POST /api/market/buyers  (admin only)
 * Creates a listing. Input is validated server-side; the client form never
 * decides what is stored.
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

  const parsed = parseBuyerInput(body);
  if (!parsed.ok) return fail("validation_failed", 422, parsed.errors);

  try {
    const buyer = await createBuyer(parsed.value);
    return NextResponse.json({ ok: true, buyer }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (isDatabaseMissing(error)) return fail("server_not_configured", 503);
    console.error("[market] create failure", error);
    return fail("store_error", 500);
  }
}
