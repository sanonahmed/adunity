import { NextResponse } from "next/server";
import { hasAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { isBuyerStatus, parseBuyerInput } from "@/lib/market";
import { setBuyerStatus, updateBuyer } from "@/lib/market-store-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

type Context = { params: Promise<{ id: string }> };

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
 * PATCH /api/market/buyers/:id  (admin only)
 *
 * Accepts either a full listing payload or `{ status }` alone. Status-only
 * updates are what the pause/reopen controls use.
 */
export async function PATCH(request: Request, context: Context) {
  if (!(await hasAdminSession())) return fail("unauthorized", 401);
  if (!hasSameOrigin(request)) return fail("bad_origin", 403);

  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) return fail("invalid_id", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_json", 400);
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const keys = Object.keys(record);

  try {
    if (keys.length === 1 && keys[0] === "status") {
      if (!isBuyerStatus(record.status)) return fail("validation_failed", 422);
      const buyer = await setBuyerStatus(id, record.status);
      if (!buyer) return fail("not_found", 404);
      return NextResponse.json({ ok: true, buyer }, { headers: NO_STORE });
    }

    const parsed = parseBuyerInput(body);
    if (!parsed.ok) return fail("validation_failed", 422, parsed.errors);

    const buyer = await updateBuyer(id, parsed.value);
    if (!buyer) return fail("not_found", 404);
    return NextResponse.json({ ok: true, buyer }, { headers: NO_STORE });
  } catch (error) {
    if (isDatabaseMissing(error)) return fail("server_not_configured", 503);
    console.error("[market] update failure", error);
    return fail("store_error", 500);
  }
}

/**
 * DELETE /api/market/buyers/:id  (admin only)
 *
 * Archive, not delete: requests keep their history and simply leave the public
 * feed. Rows are only removed by hand in the database.
 */
export async function DELETE(request: Request, context: Context) {
  if (!(await hasAdminSession())) return fail("unauthorized", 401);
  if (!hasSameOrigin(request)) return fail("bad_origin", 403);

  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) return fail("invalid_id", 400);

  try {
    const buyer = await setBuyerStatus(id, "archived");
    if (!buyer) return fail("not_found", 404);
    return NextResponse.json({ ok: true, buyer }, { headers: NO_STORE });
  } catch (error) {
    if (isDatabaseMissing(error)) return fail("server_not_configured", 503);
    console.error("[market] archive failure", error);
    return fail("store_error", 500);
  }
}
