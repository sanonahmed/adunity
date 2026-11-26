import { createHmac, randomInt } from "node:crypto";

/**
 * Binance Pay protocol primitives.
 *
 * Outgoing API calls use HMAC-SHA512 over `timestamp\nnonce\nbody\n`, keyed by
 * the merchant secret, and emit uppercase hex. Incoming webhooks use RSA-SHA256
 * over the same payload, verified with the platform certificate fetched from
 * Binance's certificate API. Webhook signatures are Base64.
 */

export const BINANCE_PAY_DEFAULT_BASE_URL = "https://bpay.binanceapi.com";
export const BINANCE_PAY_CREATE_ORDER_PATH = "/binancepay/openapi/v3/order";
export const BINANCE_PAY_QUERY_ORDER_PATH = "/binancepay/openapi/v2/order/query";
export const BINANCE_PAY_CLOSE_ORDER_PATH = "/binancepay/openapi/v2/order/close";
export const BINANCE_PAY_CERTIFICATES_NEW_PATH = "/binancepay/openapi/certificates-new";
export const BINANCE_PAY_WEBHOOK_PATH = "/api/binance-pay/webhook";
export const BINANCE_PAY_RETURN_PARAM = "binance_pay";

export const BINANCE_PAY_PRODUCT_TYPE = "AUTOBOT";
export const BINANCE_PAY_PRODUCT_NAME = "AdUnity Auto Bot activation key";
export const BINANCE_PAY_GOODS_ID = "autobot-activation-key";
export const BINANCE_PAY_GOODS_TYPE = "01";
export const BINANCE_PAY_GOODS_CATEGORY = "D000";

/** Binance Pay accepts only alphanumeric `merchantTradeNo` values. */
const TRADE_NO_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TRADE_NO_MAX = 32;

export const BINANCE_PAY_CONFIG_KEYS = {
  apiKey: "BINANCE_PAY_API_KEY",
  secret: "BINANCE_PAY_SECRET",
  merchantId: "BINANCE_PAY_MERCHANT_ID",
  callbackBaseUrl: "BINANCE_PAY_CALLBACK_BASE_URL",
  terminalType: "BINANCE_PAY_TERMINAL_TYPE",
  baseUrl: "BINANCE_PAY_BASE_URL",
} as const;

export type BinanceTerminalType = "APP" | "WEB" | "WAP" | "MINI_PROGRAM" | "OTHERS";
const TERMINAL_TYPES: readonly BinanceTerminalType[] = ["APP", "WEB", "WAP", "MINI_PROGRAM", "OTHERS"];

export type BinancePayConfig = {
  apiKey: string;
  secret: string;
  merchantId: string;
  /** Public origin used for return/cancel URLs; null falls back to request origin. */
  callbackBaseUrl: string | null;
  terminalType: BinanceTerminalType;
  baseUrl: string;
};

export type BinancePayConfigResult =
  | { ok: true; config: BinancePayConfig }
  | { ok: false; error: "server_not_configured"; missing: string[] };

/** A missing credential disables checkout rather than creating bad orders. */
export function readBinancePayConfig(env: NodeJS.ProcessEnv = process.env): BinancePayConfigResult {
  const read = (key: string): string => env[key]?.trim() ?? "";
  const apiKey = read(BINANCE_PAY_CONFIG_KEYS.apiKey);
  const secret = read(BINANCE_PAY_CONFIG_KEYS.secret);
  const merchantId = read(BINANCE_PAY_CONFIG_KEYS.merchantId);
  const missing = [
    ...(apiKey ? [] : [BINANCE_PAY_CONFIG_KEYS.apiKey]),
    ...(secret ? [] : [BINANCE_PAY_CONFIG_KEYS.secret]),
    ...(merchantId ? [] : [BINANCE_PAY_CONFIG_KEYS.merchantId]),
  ];
  if (missing.length) return { ok: false, error: "server_not_configured", missing };

  const baseUrl = (read(BINANCE_PAY_CONFIG_KEYS.baseUrl) || BINANCE_PAY_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const rawCallback = read(BINANCE_PAY_CONFIG_KEYS.callbackBaseUrl);
  const rawTerminal = read(BINANCE_PAY_CONFIG_KEYS.terminalType).toUpperCase();
  const terminalType = TERMINAL_TYPES.includes(rawTerminal as BinanceTerminalType)
    ? rawTerminal as BinanceTerminalType
    : "APP";
  return {
    ok: true,
    config: {
      apiKey,
      secret,
      merchantId,
      callbackBaseUrl: rawCallback ? rawCallback.replace(/\/+$/, "") : null,
      terminalType,
      baseUrl,
    },
  };
}

/** 32 alphanumeric characters, as the protocol requires. */
export function binancePayNonce(): string {
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += TRADE_NO_ALPHABET[randomInt(TRADE_NO_ALPHABET.length)];
  }
  return nonce;
}

export function buildBinancePayPayload(timestamp: string | number, nonce: string, body: string): string {
  return `${timestamp}\n${nonce}\n${body}\n`;
}

/** Uppercase hex HMAC-SHA512, exactly what the API request header carries. */
export function binancePayRequestSignature(payload: string, secret: string): string {
  return createHmac("sha512", secret).update(payload, "utf8").digest("hex").toUpperCase();
}

/**
 * A fresh order id, e.g. `ADU1M2N3O4P5abcdefghij`. Time-ordered enough to stay
 * readable in the merchant portal, random enough that two requests created in
 * the same millisecond never collide.
 */
export function newMerchantTradeNo(now: number = Date.now()): string {
  const stamp = now.toString(36).toUpperCase();
  const room = Math.max(8, TRADE_NO_MAX - "ADU".length - stamp.length);
  let random = "";
  for (let index = 0; index < room; index += 1) {
    random += TRADE_NO_ALPHABET[randomInt(TRADE_NO_ALPHABET.length)];
  }
  return `ADU${stamp}${random}`.slice(0, TRADE_NO_MAX);
}

/** Cheap shape test before a trade number taken from the wire is queried. */
export function isMerchantTradeNoShaped(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= TRADE_NO_MAX &&
    /^[0-9A-Za-z]+$/.test(value)
  );
}

/** Binance Pay allows a single query parameter in each redirect URL. */
export function binancePayRedirectUrl(baseUrl: string, outcome: "paid" | "cancelled"): string {
  return `${baseUrl.replace(/\/+$/, "")}/?${BINANCE_PAY_RETURN_PARAM}=${outcome}`;
}

export type ActivationOrderRequest = {
  merchantTradeNo: string;
  /** Decimal string such as "5.00000000". */
  amount: string;
  currency: string;
  terminalType: BinanceTerminalType;
  returnBaseUrl: string;
  /** Echoed back by the query and webhook APIs; carries our purchase id. */
  passThroughInfo: string;
  /** Defaults to the 30-minute activation checkout window. */
  expiresInMinutes?: number;
  /** Only set when an explicit override is configured; otherwise Binance uses the dashboard URL. */
  webhookUrl?: string;
};

/**
 * Builds the v3 create-order body. The amount is sent as a string so Postgres
 * text, the UI and Binance all agree on the exact decimal representation.
 */
export function buildActivationOrderRequest(
  input: ActivationOrderRequest,
): Record<string, unknown> {
  const expiresInMinutes = input.expiresInMinutes ?? 30;
  const orderExpireTime = Date.now() + expiresInMinutes * 60_000;

  return {
    env: { terminalType: input.terminalType },
    merchantTradeNo: input.merchantTradeNo,
    orderAmount: input.amount,
    currency: input.currency,
    description: "AdUnity Auto Bot activation key",
    orderExpireTime,
    returnUrl: binancePayRedirectUrl(input.returnBaseUrl, "paid"),
    cancelUrl: binancePayRedirectUrl(input.returnBaseUrl, "cancelled"),
    passThroughInfo: input.passThroughInfo,
    ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
    goodsDetails: [
      {
        goodsType: BINANCE_PAY_GOODS_TYPE,
        goodsCategory: BINANCE_PAY_GOODS_CATEGORY,
        referenceGoodsId: BINANCE_PAY_GOODS_ID,
        goodsName: BINANCE_PAY_PRODUCT_NAME,
        goodsDetail: "One-time Auto Bot activation key, delivered after payment confirmation.",
      },
    ],
  };
}
