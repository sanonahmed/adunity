import { NextResponse } from "next/server";
import { createDemoSale, DemoSaleStoreError, importLegacyDemoSales, listDemoSales } from "@/lib/demo-sales-store-postgres";
import { DEMO_SALES_LIMITS, parseDemoSales } from "@/lib/market";
import { readInitData, validateInitData } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

type RequestBody = Record<string, unknown>;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

function getObject(value: unknown): RequestBody | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RequestBody
    : null;
}

function parseNewSale(value: unknown): { id: string; buyerId: string; quantity: number } | null {
  const sale = getObject(value);
  if (!sale) return null;
  const { id, buyerId, quantity } = sale;
  if (typeof id !== "string" || id.length < 1 || id.length > DEMO_SALES_LIMITS.id || /[\u0000-\u001f\u007f]/.test(id)) return null;
  if (typeof buyerId !== "string" || buyerId.length < 1 || buyerId.length > DEMO_SALES_LIMITS.buyerId || /[\u0000-\u001f\u007f]/.test(buyerId)) return null;
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 25) return null;
  return { id, buyerId, quantity };
}

/** POST /api/demo-sales: load/migrate legacy receipts, or create one new database-backed sale. */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return fail("server_not_configured", 503);

  let body: RequestBody | null;
  try {
    body = getObject(await request.json());
  } catch {
    return fail("invalid_json", 400);
  }
  if (!body) return fail("invalid_request", 400);

  const initData = readInitData(body);
  if (!initData) return fail("missing_init_data", 400);
  const verified = validateInitData(initData, botToken);
  if (!verified.ok) return fail(verified.reason, 401);
  if (!verified.user || !Number.isSafeInteger(verified.user.id) || verified.user.id < 1) {
    return fail("malformed_user", 401);
  }

  try {
    if (body.sale !== undefined) {
      const sale = parseNewSale(body.sale);
      if (!sale) return fail("invalid_sale", 422);
      const saved = await createDemoSale(verified.user.id, sale);
      const sales = await listDemoSales(verified.user.id);
      return NextResponse.json({ ok: true, sale: saved, sales }, { headers: NO_STORE });
    }

    if (body.legacySales !== undefined) {
      if (!Array.isArray(body.legacySales) || body.legacySales.length > 1_000) {
        return fail("invalid_legacy_sales", 422);
      }
      const legacySales = parseDemoSales(body.legacySales);
      if (legacySales.length !== body.legacySales.length) return fail("invalid_legacy_sales", 422);
      await importLegacyDemoSales(verified.user.id, legacySales);
    }

    const sales = await listDemoSales(verified.user.id);
    return NextResponse.json({ ok: true, sales }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Error && error.message === "database_not_configured") {
      return fail("server_not_configured", 503);
    }
    if (error instanceof DemoSaleStoreError) {
      const status = error.message === "buyer_not_available" ? 409 : 422;
      return fail(error.message, status);
    }
    console.error("[demo-sales] store failure", error);
    return fail("store_error", 500);
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405, headers: { ...NO_STORE, Allow: "POST" } },
  );
}
