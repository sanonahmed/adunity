import { NextResponse } from "next/server";
import {
  ACTIVATION_PURCHASE_LIMITS,
  ACTIVATION_PRICE,
  amountsMatch,
} from "@/lib/activation-purchase";
import { BINANCE_PAY_QUERY_ORDER_PATH, readBinancePayConfig } from "@/lib/binance-pay";
import { callBinancePay } from "@/lib/binance-pay-api";
import {
  applyActivationOrderStatus,
  claimActivationStatusRefresh,
  consumeActivationPurchaseKey,
  findActivationPurchase,
  fulfillActivationPurchase,
} from "@/lib/activation-purchase-store-postgres";
import { readInitData, validateInitData } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
type QueryOrderData = {
  merchantTradeNo?: string;
  transactionId?: string;
  status?: string;
  currency?: string;
  orderAmount?: string;
  transactTime?: number;
};

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const config = readBinancePayConfig();
  if (!botToken || !config.ok) return fail("payments_unavailable", 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_json", 400);
  }
  const source = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const initData = readInitData(source);
  if (!initData) return fail("missing_init_data", 400);
  const verified = validateInitData(initData, botToken);
  if (!verified.ok) return fail(verified.reason, 401);
  if (!verified.user) return fail("malformed_user", 401);
  const purchaseId = typeof source.purchaseId === "string" ? source.purchaseId : "";
  if (!/^pur_[A-Za-z0-9_-]{20,40}$/.test(purchaseId)) return fail("invalid_request", 400);

  try {
    let purchase = await findActivationPurchase(purchaseId, verified.user.id);
    if (!purchase) return fail("unknown_order", 404);

    const tradeNo = await claimActivationStatusRefresh(
      purchaseId,
      verified.user.id,
      ACTIVATION_PURCHASE_LIMITS.refreshIntervalMs,
    );
    if (tradeNo) {
      try {
        const response = await callBinancePay<QueryOrderData>(config.config, BINANCE_PAY_QUERY_ORDER_PATH, {
          merchantTradeNo: tradeNo,
        });
        const order = response.data;
        if (response.status === "SUCCESS" && order?.merchantTradeNo === tradeNo) {
          if (order.status === "PAID") {
            if (
              order.currency !== ACTIVATION_PRICE.currency ||
              !amountsMatch(order.orderAmount, ACTIVATION_PRICE.amount) ||
              !order.transactionId
            ) return fail("payment_mismatch", 409);
            const fulfillment = await fulfillActivationPurchase({
              merchantTradeNo: tradeNo,
              amount: order.orderAmount!,
              currency: order.currency,
              transactionId: order.transactionId,
              paidAt: new Date(order.transactTime ?? Date.now()).toISOString(),
            });
            if (!fulfillment.ok) return fail(fulfillment.reason, 409);
          } else if (["EXPIRED", "CANCELED", "ERROR"].includes(order.status ?? "")) {
            await applyActivationOrderStatus(tradeNo, "expired");
          }
        }
      } catch (error) {
        // A transient query outage must not turn a live order into a failed payment.
        console.error("[binance-pay] order status query failed", error);
      }
    }

    purchase = await findActivationPurchase(purchaseId, verified.user.id);
    if (!purchase) return fail("unknown_order", 404);
    const key = purchase.status === "paid"
      ? await consumeActivationPurchaseKey(purchaseId, verified.user.id)
      : null;
    return NextResponse.json({ ok: true, purchase, key }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Error && error.message === "database_not_configured") return fail("server_not_configured", 503);
    console.error("[binance-pay] order status failed", error);
    return fail("store_error", 500);
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, {
    status: 405,
    headers: { ...NO_STORE, Allow: "POST" },
  });
}
