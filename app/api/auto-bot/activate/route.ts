import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Validates an activation key against its server-only SHA-256 digest. */
export async function POST(request: Request) {
  const expectedHash = process.env.AUTOBOT_ACTIVATION_KEY_SHA256?.trim().toLowerCase();
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return fail("server_not_configured", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", 400);
  }

  const key =
    typeof body === "object" && body !== null && "key" in body && typeof body.key === "string"
      ? body.key
      : "";
  if (!key || key.length > 512) return fail("invalid_key", 401);

  const submittedHash = createHash("sha256").update(key, "utf8").digest();
  const configuredHash = Buffer.from(expectedHash, "hex");
  if (!timingSafeEqual(submittedHash, configuredHash)) return fail("invalid_key", 401);

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  return fail("method_not_allowed", 405);
}
