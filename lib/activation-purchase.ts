/**
 * Activation purchase vocabulary shared by the Mini App UI and the server.
 *
 * Everything here is dependency-free and side-effect-free, so the offer panel
 * can import it directly while the API routes use the same price, statuses and
 * error copy. Keeping one definition means the amount the buyer sees is the
 * amount the server verifies against Binance Pay.
 */

/** The one paid offer: one Auto Bot activation key for 5 USDT. */
export const ACTIVATION_PRICE = {
  amount: 5,
  currency: "USDT",
  /** Short label for buttons and headings. */
  label: "$5 USDT",
} as const;

export const ACTIVATION_PURCHASE_LIMITS = {
  /** Binance Pay expires the order after this long; the checkout page stops too. */
  ttlMinutes: 30,
  /** Minimum gap between two Binance order lookups for the same payment. */
  refreshIntervalMs: 4_000,
  /** Polling cadence the Mini App uses while a checkout is open. */
  pollIntervalMs: 6_000,
  /** Upper bound for a client-supplied purchase id. */
  id: 64,
} as const;

/**
 * `pending`  - created, not paid yet (checkout is still open)
 * `paid`     - verified payment; exactly one activation key was issued
 * `closed`   - cancelled, failed or expired without payment
 * `expired`  - the checkout window elapsed and a new order replaced it
 * `refunded` - Binance refunded the payment after it settled
 */
export type ActivationPaymentStatus = "pending" | "paid" | "closed" | "expired" | "refunded";

export type ActivationPurchase = {
  id: string;
  status: ActivationPaymentStatus;
  /** Decimal string as returned by Binance Pay, e.g. "5.00000000". */
  amount: string;
  currency: string;
  checkoutUrl: string;
  deeplink: string;
  universalUrl: string;
  qrContent: string;
  qrcodeLink: string;
  /** ISO timestamp. */
  expiresAt: string;
  paidAt: string | null;
  /** Masked key label, e.g. "ADU-8F2K...6HZN". Never the full key. */
  keyHint: string | null;
};

export type ActivationPurchaseKey = {
  /** Full plaintext key, delivered only to the paying Telegram account. */
  secret: string;
  hint: string;
};

/** Server error codes -> readable copy. Unknown codes never leak internals. */
export const ACTIVATION_PURCHASE_ERRORS: Record<string, string> = {
  payments_unavailable:
    "Card and crypto checkout is temporarily unavailable. Please try again later.",
  server_not_configured: "Checkout is temporarily unavailable. Please try again later.",
  missing_init_data:
    "Open AdUnity from Telegram to pay. Payments need your verified Telegram account.",
  invalid_json: "Something went wrong starting the payment. Please try again.",
  invalid_request: "Something went wrong starting the payment. Please try again.",
  bad_signature: "We couldn't verify this Telegram session. Reopen AdUnity and try again.",
  expired: "This Telegram session has expired. Close and reopen AdUnity to refresh it.",
  missing_hash: "We couldn't verify this Telegram session. Reopen AdUnity and try again.",
  missing_auth_date: "We couldn't verify this Telegram session. Reopen AdUnity and try again.",
  malformed_user: "Open AdUnity from your personal Telegram account and try again.",
  too_many_attempts: "Too many payment attempts. Please wait a few minutes and try again.",
  store_error: "Payments are temporarily unavailable. Please try again shortly.",
  provider_error:
    "Binance Pay didn't accept the checkout request. Please try again in a moment.",
  unknown_order: "We couldn't find that payment. Start a new checkout.",
  payment_mismatch: "That payment doesn't match this offer. Please contact support.",
};

export function activationPurchaseErrorText(code: string | null | undefined): string {
  if (!code) return "Something went wrong with this payment. Please try again.";
  return (
    ACTIVATION_PURCHASE_ERRORS[code] ?? "Something went wrong with this payment. Please try again."
  );
}

const paymentStatuses: readonly ActivationPaymentStatus[] = [
  "pending",
  "paid",
  "closed",
  "expired",
  "refunded",
];

export function isActivationPaymentStatus(value: unknown): value is ActivationPaymentStatus {
  return typeof value === "string" && paymentStatuses.includes(value as ActivationPaymentStatus);
}

/** True while the checkout page can still take a payment. */
export function isActivationPurchaseOpen(purchase: ActivationPurchase): boolean {
  return purchase.status === "pending" && Date.parse(purchase.expiresAt) > Date.now();
}

/** Fixed-point 10^-8 units, so "5.00000000" and "5" compare exactly. */
const AMOUNT_SCALE = 8;

/**
 * Parses a Binance Pay decimal into 10^-8 units. Returns null for anything that
 * is not a plain non-negative decimal with at most eight fraction digits, which
 * is exactly the shape Binance Pay documents for an order amount.
 */
export function amountUnits(value: string | number | null | undefined): bigint | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return amountUnits(value.toFixed(AMOUNT_SCALE));
  }
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(text)) return null;

  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 10n ** BigInt(AMOUNT_SCALE) + BigInt(fraction.padEnd(AMOUNT_SCALE, "0"));
}

/** Compares two amounts as exact decimals; false when either is malformed. */
export function amountsMatch(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
): boolean {
  const a = amountUnits(left);
  const b = amountUnits(right);
  return a !== null && b !== null && a === b;
}

/** "5.00000000" -> "5"; "5.50000000" -> "5.5". */
export function formatUsdtAmount(value: string | number): string {
  const text = typeof value === "number" ? value.toFixed(AMOUNT_SCALE) : value.trim();
  if (!text.includes(".")) return text;
  return text.replace(/\.?0+$/, "");
}

function readString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

/**
 * Validates the purchase JSON before the UI renders it. A malformed payload is
 * dropped rather than half-rendered, so a broken response can never show a
 * checkout link or an amount the server did not intend.
 */
export function parseActivationPurchase(value: unknown): ActivationPurchase | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Record<string, unknown>;

  const id = readString(source.id, ACTIVATION_PURCHASE_LIMITS.id);
  const status = source.status;
  const amount = readString(source.amount, 24);
  const currency = readString(source.currency, 12);
  const expiresAt = readString(source.expiresAt, 40);

  if (!id || !isActivationPaymentStatus(status) || !currency || !expiresAt) return null;
  if (amountUnits(amount) === null) return null;
  if (Number.isNaN(Date.parse(expiresAt))) return null;

  const paidAt = readString(source.paidAt, 40);
  const keyHint = readString(source.keyHint, 32);

  return {
    id,
    status,
    amount,
    currency,
    checkoutUrl: readString(source.checkoutUrl, 512),
    deeplink: readString(source.deeplink, 512),
    universalUrl: readString(source.universalUrl, 512),
    qrContent: readString(source.qrContent, 512),
    qrcodeLink: readString(source.qrcodeLink, 512),
    expiresAt,
    paidAt: paidAt && !Number.isNaN(Date.parse(paidAt)) ? paidAt : null,
    keyHint: keyHint || null,
  };
}

export function parseActivationPurchaseKey(value: unknown): ActivationPurchaseKey | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Record<string, unknown>;
  const secret = readString(source.secret, 64);
  const hint = readString(source.hint, 32);
  return secret && hint ? { secret, hint } : null;
}
