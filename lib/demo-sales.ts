import { parseDemoSales, type DemoSaleRecord } from "./market";

/** The v1 browser key is read only to migrate surviving receipts into Postgres. */
const LEGACY_DEMO_SALES_STORAGE_KEY = "adunity:demo-sales:v1";

/** Reads and validates receipts left by the previous browser-only storage version. */
export function readLegacyDemoSales(): DemoSaleRecord[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_DEMO_SALES_STORAGE_KEY);
    return raw ? parseDemoSales(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Delete legacy browser data only after the server confirms a successful migration/load. */
export function clearLegacyDemoSales(): void {
  try {
    window.localStorage.removeItem(LEGACY_DEMO_SALES_STORAGE_KEY);
  } catch {
    /* Storage can be unavailable in private or embedded browsers. */
  }
}

/** UUID where available, with a timestamp/random fallback for older webviews. */
export function createDemoSaleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
