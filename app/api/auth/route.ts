import { NextResponse } from "next/server";
import { readInitData, validateInitData } from "@/lib/telegram-auth";

/** crypto + env access require the Node runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth
 * body: { initData: string }   ← Telegram.WebApp.initData
 *
 * Returns the verified user, or 401. This is the only trusted identity source;
 * everything the client renders from `initDataUnsafe` is cosmetic.
 *
 * This endpoint verifies identity only. Referral account creation and invite
 * attribution happen transactionally in /api/referral; a first-party session
 * cookie is still a separate future enhancement.
 */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json(
      { ok: false, error: "server_not_configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const initData = readInitData(body);
  if (!initData) {
    return NextResponse.json({ ok: false, error: "missing_init_data" }, { status: 400 });
  }

  const result = validateInitData(initData, botToken);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    user: result.user,
    authDate: result.authDate.toISOString(),
    startParam: result.startParam,
  });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
