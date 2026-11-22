import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution (shadcn/ui helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 48250 -> "48.3K", 1240 -> "1.2K" */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return String(Math.round(value));
  const units = ["K", "M", "B"];
  let scaled = value;
  let unit = -1;
  while (Math.abs(scaled) >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  const digits = Math.abs(scaled) < 10 ? 1 : 0;
  return `${scaled.toFixed(digits).replace(/\.0$/, "")}${units[unit]}`;
}

/** Formats an amount of US dollars for display. */
export function currency(value: number, withCents = true): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(value);
}

export function initials(firstName?: string, lastName?: string): string {
  const a = firstName?.trim().charAt(0) ?? "";
  const b = lastName?.trim().charAt(0) ?? "";
  const joined = `${a}${b}`.toUpperCase();
  return joined || "AU";
}
