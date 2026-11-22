import { NextResponse } from "next/server";
import { recordVisit } from "@/lib/referral-store";
import type { ReferralApiFailure, ReferralApiResponse } from "@/lib/referral";
import { readInitData, validateInitData } from "@/lib/telegram-auth";

/** SQLite + crypto + env access all require the Node runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: ReferralApiFailure["error"], status: number) {
  return NextResponse.json(
    { ok: false, error } satisfies ReferralApiResponse,
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST /api/referral
 * body: { initData: string }   ← Telegram.WebApp.initData
 *
 * Verifies the Telegram signature, upserts the account, attributes the inviter
 * named by the *signed* `start_param`, and returns the caller's referral record.
 *
 * The client never sends its own Telegram id, invite code or referral counts:
 * all three are derived here from the verified payload. That is what makes the
 * numbers trustworthy if this app is ever opened outside Telegram.
 */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    /* Fail closed with an actionable code instead of pretending to have data. */
    return fail("server_not_configured", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_json", 400);
  }

  const initData = readInitData(body);
  if (!initData) {
    return fail("missing_init_data", 400);
  }

  const verified = validateInitData(initData, botToken);
  if (!verified.ok) {
    return fail(verified.reason, 401);
  }

  if (!verified.user) {
    /* A signature can be valid without a `user` field (e.g. bot chats). */
    return fail("malformed_user", 401);
  }

  try {
    const { summary } = recordVisit(verified.user, verified.startParam);
    return NextResponse.json(
      { ok: true, referral: summary } satisfies ReferralApiResponse,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[referral] store failure", error);
    return fail("store_error", 500);
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
