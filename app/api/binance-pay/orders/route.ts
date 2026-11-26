import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ACTIVATION_PURCHASE_LIMITS,
  ACTIVATION_PRICE,
} from "@/lib/activation-purchase";
import {
  BINANCE_PAY_CREATE_ORDER_PATH,
  buildActivationOrderRequest,
  newMerchantTradeNo,
  readBinancePayConfig,
} from "@/lib/binance-pay";
import { callBinancePay } from "@/lib/binance-pay-api";
import {
  createActivationPurchase,
  failActivationPurchase,
  updateActivationCheckout,
} from "@/lib/activation-purchase-store-postgres";
import { readInitData, validateInitData } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

type CreateOrderData = {
  prepayId?: string;
  expireTime?: number;
  checkoutUrl?: string;
  deeplink?: string;
  universalUrl?: string;
  qrContent?: string;
  qrcodeLink?: string;
  totalFee?: string;
  currency?: string;
};

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

function secureBaseUrl(request: Request, configured: string | null): string | null {
  const raw = configured || new URL(request.url).origin;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function providerUrl(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || !value) return allowEmpty ? "" : "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Public, non-sensitive switch used only to hide checkout until credentials exist. */
export async function GET() {
  const config = readBinancePayConfig();
  return NextResponse.json(
    { ok: true, enabled: config.ok && Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()) },
    { headers: NO_STORE },
  );
}

/** Create a fixed-price USDT order for the verified Telegram account. */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const configResult = readBinancePayConfig();
  if (!botToken || !configResult.ok) return fail("payments_unavailable", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_json", 400);
  }
  const initData = readInitData(body);
  if (!initData) return fail("missing_init_data", 400);
  const verified = validateInitData(initData, botToken);
  if (!verified.ok) return fail(verified.reason, 401);
  if (!verified.user) return fail("malformed_user", 401);

  const returnBaseUrl = secureBaseUrl(request, configResult.config.callbackBaseUrl);
  if (!returnBaseUrl) return fail("server_not_configured", 503);

  const purchaseId = `pur_${randomBytes(18).toString("base64url")}`;
  const merchantTradeNo = newMerchantTradeNo();
  const amount = "5.00000000";
  const expiresAt = new Date(Date.now() + ACTIVATION_PURCHASE_LIMITS.ttlMinutes * 60_000).toISOString();

  try {
    await createActivationPurchase({
      userId: verified.user.id,
      amount,
      currency: ACTIVATION_PRICE.currency,
      merchantTradeNo,
      purchaseId,
      expiresAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "database_not_configured") return fail("server_not_configured", 503);
    console.error("[binance-pay] order persistence failed", error);
    return fail("store_error", 500);
  }

  try {
    const webhookUrl = `${returnBaseUrl}/api/binance-pay/webhook`;
    const requestBody = buildActivationOrderRequest({
      merchantTradeNo,
      amount,
      currency: ACTIVATION_PRICE.currency,
      terminalType: configResult.config.terminalType,
      returnBaseUrl,
      passThroughInfo: purchaseId,
      expiresInMinutes: ACTIVATION_PURCHASE_LIMITS.ttlMinutes,
      webhookUrl,
    });
    const response = await callBinancePay<CreateOrderData>(
      configResult.config,
      BINANCE_PAY_CREATE_ORDER_PATH,
      requestBody,
    );
    const data = response.data;
    if (
      response.status !== "SUCCESS" || !data ||
      !data.prepayId || !data.expireTime ||
      data.currency !== ACTIVATION_PRICE.currency ||
      typeof data.totalFee !== "string" || data.totalFee !== amount ||
      !providerUrl(data.checkoutUrl) || !providerUrl(data.qrContent) ||
      !providerUrl(data.deeplink) || !providerUrl(data.universalUrl)
    ) {
      throw new Error("binance_create_order_rejected_or_mismatched");
    }
    const purchase = await updateActivationCheckout({
      purchaseId,
      userId: verified.user.id,
      prepayId: data.prepayId,
      checkoutUrl: providerUrl(data.checkoutUrl),
      deeplink: providerUrl(data.deeplink),
      universalUrl: providerUrl(data.universalUrl),
      qrContent: providerUrl(data.qrContent),
      qrcodeLink: providerUrl(data.qrcodeLink, true),
      expiresAt: new Date(data.expireTime).toISOString(),
    });
    if (!purchase) throw new Error("activation_purchase_missing_after_create");
    return NextResponse.json({ ok: true, purchase }, { status: 201, headers: NO_STORE });
  } catch (error) {
    await failActivationPurchase(purchaseId).catch(() => undefined);
    console.error("[binance-pay] create order failed", error);
    return fail("provider_error", 502);
  }
}
