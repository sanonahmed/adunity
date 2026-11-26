/**
 * Market listings shared by the Home feed, the admin panel and the API.
 *
 * Listings are demo records: they describe a buyer request in the abstract
 * (name, quantity, delivered count, budget). No credentials, account hand-off or
 * payment flow exists anywhere in this app, so delivery progress is illustrative
 * bookkeeping only.
 */

export const BUYER_REQUIREMENTS = ["Fresh", "Aged", "Phone verified"] as const;
export type BuyerRequirement = (typeof BUYER_REQUIREMENTS)[number];

export const BUYER_STATUSES = ["open", "paused", "archived"] as const;
export type BuyerStatus = (typeof BUYER_STATUSES)[number];

export const MARKET_FILTERS = ["All", ...BUYER_REQUIREMENTS] as const;
export type MarketFilter = (typeof MARKET_FILTERS)[number];

export type DemoSaleRecord = {
  /** Stable id so saved receipts are never applied twice. */
  id: string;
  buyerId: string;
  buyer: string;
  quantity: number;
  amountBdt: number;
  createdAt: string;
};

export const DEMO_SALES_LIMITS = {
  id: 64,
  buyerId: 128,
} as const;

export type BuyerRequest = {
  id: string;
  buyer: string;
  verified: boolean;
  item: string;
  quantity: number;
  /** Accounts delivered so far; never greater than `quantity`. */
  fulfilled: number;
  requirement: BuyerRequirement;
  budgetPerAccountBdt: number;
  /** Admin-only note; null in the public feed. */
  note: string | null;
  /** Admin-only contact handle; null in the public feed. */
  telegramUsername: string | null;
  status: BuyerStatus;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. */
  updatedAt: string;
};

export type BuyerInput = {
  buyer: string;
  verified: boolean;
  item: string;
  quantity: number;
  fulfilled: number;
  requirement: BuyerRequirement;
  budgetPerAccountBdt: number;
  note: string | null;
  telegramUsername: string | null;
  status: BuyerStatus;
};

export type BuyerField = keyof BuyerInput;
export type BuyerErrors = Partial<Record<BuyerField, string>>;

export type BuyerParseResult =
  | { ok: true; value: BuyerInput }
  | { ok: false; errors: BuyerErrors };

export const MARKET_LIMITS = {
  buyer: 60,
  item: 80,
  note: 280,
  telegramUsername: 32,
  quantityMax: 100_000,
  budgetMax: 1_000_000,
} as const;

export function isBuyerRequirement(value: unknown): value is BuyerRequirement {
  return typeof value === "string" && (BUYER_REQUIREMENTS as readonly string[]).includes(value);
}

export function isBuyerStatus(value: unknown): value is BuyerStatus {
  return typeof value === "string" && (BUYER_STATUSES as readonly string[]).includes(value);
}

/** Trim, drop control characters, and collapse runs of whitespace. */
function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{1,7}$/.test(value.trim())) return Number(value.trim());
  return null;
}

const bdtFormat = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 });

/** 4500 -> "৳4,500" */
export function formatBdt(value: number): string {
  return `৳${bdtFormat.format(Number.isFinite(value) ? value : 0)}`;
}

export function totalBudget(
  request: Pick<BuyerRequest, "quantity" | "budgetPerAccountBdt">,
): number {
  return request.quantity * request.budgetPerAccountBdt;
}

/** Accounts still needed before a request is complete; never negative. */
export function remainingQuantity(
  request: Pick<BuyerRequest, "quantity" | "fulfilled">,
): number {
  return Math.max(0, request.quantity - request.fulfilled);
}

/** Delivered share of the requested quantity, clamped to 0–100. */
export function fulfillmentPercent(
  request: Pick<BuyerRequest, "quantity" | "fulfilled">,
): number {
  if (!Number.isFinite(request.quantity) || request.quantity <= 0) return 0;
  const percent = Math.round((request.fulfilled / request.quantity) * 100);
  return Math.min(100, Math.max(0, percent));
}

export function isFullyDelivered(
  request: Pick<BuyerRequest, "quantity" | "fulfilled">,
): boolean {
  return request.quantity > 0 && request.fulfilled >= request.quantity;
}

/** ISO timestamp -> "just now" / "12 min ago" / "3 h ago" / "2 d ago" */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const posted = Date.parse(iso);
  if (!Number.isFinite(posted)) return "just now";
  const minutes = Math.max(0, Math.round((now - posted) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(posted).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Admin table timestamp, e.g. "25 Nov 2026, 18:04". */
export function formatDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Validates demo receipts restored from browser storage.
 *
 * Stored values are user-editable, so anything malformed is dropped instead of
 * being trusted for buyer progress or the Profile balance. Duplicate ids are
 * collapsed, which keeps a reload or a repeated write from counting a sale twice.
 */
export function parseDemoSales(value: unknown): DemoSaleRecord[] {
  if (!Array.isArray(value)) return [];

  const sales: DemoSaleRecord[] = [];
  const seenIds = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;

    const source = entry as Record<string, unknown>;
    const id = cleanText(source.id, DEMO_SALES_LIMITS.id);
    const buyerId = cleanText(source.buyerId, DEMO_SALES_LIMITS.buyerId);
    const buyer = cleanText(source.buyer, MARKET_LIMITS.buyer);
    const quantity = readInteger(source.quantity);
    const amountBdt = readInteger(source.amountBdt);
    const createdAt = typeof source.createdAt === "string" ? Date.parse(source.createdAt) : NaN;

    if (!id || !buyerId || !buyer || seenIds.has(id)) continue;
    if (quantity === null || quantity < 1 || quantity > MARKET_LIMITS.quantityMax) continue;
    if (amountBdt === null || amountBdt < 0 || !Number.isSafeInteger(amountBdt)) continue;
    if (amountBdt > quantity * MARKET_LIMITS.budgetMax) continue;
    if (!Number.isFinite(createdAt)) continue;

    const createdDate = new Date(createdAt);
    if (Number.isNaN(createdDate.getTime())) continue;

    seenIds.add(id);
    sales.push({
      id,
      buyerId,
      buyer,
      quantity,
      amountBdt,
      createdAt: createdDate.toISOString(),
    });
  }

  return sales;
}

/** Total illustrative proceeds across saved demo receipts. */
export function demoBalanceBdt(sales: readonly DemoSaleRecord[]): number {
  return sales.reduce((sum, sale) => sum + sale.amountBdt, 0);
}

/**
 * Validates an untrusted admin payload. Every write path runs through this,
 * so the client form and the API can never disagree about what is allowed.
 */
export function parseBuyerInput(body: unknown): BuyerParseResult {
  const errors: BuyerErrors = {};
  const source = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const buyer = cleanText(source.buyer, MARKET_LIMITS.buyer);
  if (!buyer || buyer.length < 2) errors.buyer = "Enter a buyer name (2+ characters).";

  const item = cleanText(source.item, MARKET_LIMITS.item);
  if (!item || item.length < 2) errors.item = "Enter what the buyer wants (2+ characters).";

  const quantity = readInteger(source.quantity);
  if (quantity === null || quantity < 1 || quantity > MARKET_LIMITS.quantityMax) {
    errors.quantity = `Use a whole number from 1 to ${MARKET_LIMITS.quantityMax}.`;
  }

  /* Omitted means "nothing delivered yet"; a full PATCH always sends the field. */
  const fulfilled =
    source.fulfilled === undefined || source.fulfilled === null
      ? 0
      : readInteger(source.fulfilled);
  if (fulfilled === null || fulfilled < 0) {
    errors.fulfilled = "Use a whole number of 0 or more.";
  } else if (quantity !== null && fulfilled > quantity) {
    errors.fulfilled = `Delivered cannot exceed the requested quantity (${quantity}).`;
  }

  if (!isBuyerRequirement(source.requirement)) {
    errors.requirement = "Choose a delivery requirement.";
  }

  const budget = readInteger(source.budgetPerAccountBdt);
  if (budget === null || budget < 1 || budget > MARKET_LIMITS.budgetMax) {
    errors.budgetPerAccountBdt = `Use a whole number from 1 to ${MARKET_LIMITS.budgetMax}.`;
  }

  let verified = false;
  if (source.verified !== undefined && source.verified !== null) {
    if (typeof source.verified !== "boolean") errors.verified = "Verified must be true or false.";
    else verified = source.verified;
  }

  const note = cleanText(source.note, MARKET_LIMITS.note);
  if (typeof source.note === "string" && source.note.length > MARKET_LIMITS.note) {
    errors.note = `Keep the note under ${MARKET_LIMITS.note} characters.`;
  }

  let telegramUsername: string | null = null;
  if (source.telegramUsername !== undefined && source.telegramUsername !== null) {
    const raw = typeof source.telegramUsername === "string" ? source.telegramUsername.trim() : "";
    if (raw) {
      const handle = raw.replace(/^@/, "");
      if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(handle)) {
        errors.telegramUsername = "Use a Telegram handle: 5–32 letters, digits or underscores.";
      } else {
        telegramUsername = handle;
      }
    }
  }

  let status: BuyerStatus = "open";
  if (source.status !== undefined && source.status !== null) {
    if (!isBuyerStatus(source.status)) errors.status = "Choose a valid status.";
    else status = source.status;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      buyer: buyer as string,
      verified,
      item: item as string,
      quantity: quantity as number,
      fulfilled: fulfilled as number,
      requirement: source.requirement as BuyerRequirement,
      budgetPerAccountBdt: budget as number,
      note,
      telegramUsername,
      status,
    },
  };
}
