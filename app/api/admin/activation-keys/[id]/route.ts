import { NextResponse } from "next/server";
import { hasAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { revokeActivationKey } from "@/lib/activation-key-store-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

type Context = { params: Promise<{ id: string }> };

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/**
 * DELETE /api/admin/activation-keys/:id  (admin only)
 *
 * Revokes a key in place: it stops unlocking Auto Bot immediately, but the row
 * (label, creation time, use count) stays for the audit trail. Repeating the
 * call answers `404` because the key is already revoked.
 */
export async function DELETE(request: Request, context: Context) {
  if (!(await hasAdminSession())) return fail("unauthorized", 401);
  if (!hasSameOrigin(request)) return fail("bad_origin", 403);

  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) return fail("invalid_id", 400);

  try {
    const key = await revokeActivationKey(id);
    if (!key) return fail("not_found", 404);
    return NextResponse.json({ ok: true, key }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Error && error.message === "database_not_configured") {
      return fail("server_not_configured", 503);
    }
    console.error("[activation] revoke failure", error);
    return fail("store_error", 500);
  }
}
