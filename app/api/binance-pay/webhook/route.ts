import { NextResponse } from "next/server";
import { ACTIVATION_PRICE, amountsMatch } from "@/lib/activation-purchase";
import {
  BINANCE_PAY_QUERY_ORDER_PATH,
  isMerchantTradeNoShaped,
  readBinancePayConfig,
} from "@/lib/binance-pay";
import { callBinancePay, verifyBinancePayWebhook } from "@/lib/binance-pay-api";
import {
  applyActivationOrderStatus,
  fulfillActivationPurchase,
} from "@/lib/activation-purchase-store-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type NotificationData = {
  merchantTradeNo?: string;
  totalFee?: string | number;
  currency?: string;
  transactionId?: string;
  transactTime?: number;
};
type QueryOrderData = {
  merchantTradeNo?: string;
  transactionId?: string;
  status?: string;
  currency?: string;
  orderAmount?: string;
  transactTime?: number;
};

function reject(status: number, message: string) {
  return NextResponse.json({ returnCode: "FAIL", returnMessage: message }, { status });
}

function success() {
  return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
}

/** Binance Pay callback: verify RSA signature first, then verify the order via signed query API. */
export async function POST(request: Request) {
  const config = readBinancePayConfig();
  if (!config.ok) return reject(503, "not configured");
  const rawBody = await request.text();
  if (rawBody.length > 64_000) return reject(413, "payload too large");

  try {
    if (!(await verifyBinancePayWebhook(config.config, request.headers, rawBody))) {
      return reject(401, "invalid signature");
    }
  } catch (error) {
    console.error("[binance-pay] certificate verification failed", error);
    return reject(503, "signature verification unavailable");
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return reject(400, "invalid json");
  }
  if (typeof event !== "object" || event === null) return reject(400, "invalid event");
  const envelope = event as Record<string, unknown>;
  if (envelope.bizType !== "PAY" || typeof envelope.data !== "string") return reject(400, "invalid event");
  let data: NotificationData;
  try {
    const parsed: unknown = JSON.parse(envelope.data);
    if (typeof parsed !== "object" || parsed === null) return reject(400, "invalid data");
    data = parsed as NotificationData;
  } catch {
    return reject(400, "invalid data");
  }
  const tradeNo = data.merchantTradeNo;
  if (!isMerchantTradeNoShaped(tradeNo)) return reject(400, "invalid trade number");

  try {
    if (envelope.bizStatus === "PAY_CLOSED") {
      await applyActivationOrderStatus(tradeNo, "expired");
      return success();
    }
    if (envelope.bizStatus !== "PAY_SUCCESS") return reject(400, "unsupported event");
    if (
      data.currency !== ACTIVATION_PRICE.currency ||
      !amountsMatch(data.totalFee, ACTIVATION_PRICE.amount) ||
      !data.transactionId
    ) return reject(400, "payment mismatch");

    // Do not fulfill from webhook fields alone: ask Binance for the authoritative order.
    const response = await callBinancePay<QueryOrderData>(config.config, BINANCE_PAY_QUERY_ORDER_PATH, {
      merchantTradeNo: tradeNo,
    });
    const order = response.data;
    if (
      response.status !== "SUCCESS" || order?.status !== "PAID" ||
      order.merchantTradeNo !== tradeNo ||
      order.transactionId !== data.transactionId ||
      order.currency !== ACTIVATION_PRICE.currency ||
      !amountsMatch(order.orderAmount, ACTIVATION_PRICE.amount)
    ) return reject(409, "order not verified");

    const result = await fulfillActivationPurchase({
      merchantTradeNo: tradeNo,
      amount: order.orderAmount!,
      currency: order.currency!,
      transactionId: order.transactionId!,
      paidAt: new Date(order.transactTime ?? data.transactTime ?? Date.now()).toISOString(),
    });
    if (!result.ok) return reject(result.reason === "not_found" ? 404 : 409, result.reason);
    return success();
  } catch (error) {
    if (error instanceof Error && error.message === "database_not_configured") return reject(503, "store unavailable");
    console.error("[binance-pay] webhook processing failed", error);
    return reject(500, "processing failed");
  }
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
}
