import { CURRENCY } from "./config";

/**
 * Prices are stored as integer cents. Money never becomes a float, and the browser is never
 * the source of truth for what a garment costs - these helpers are also used to *validate*
 * what a client claims.
 */

export function formatUsd(cents: number): string {
  const amount = cents / CURRENCY.minorUnits;
  const rounded = Math.round(amount * 100) / 100;
  return new Intl.NumberFormat(CURRENCY.locale, {
    style: "currency",
    currency: CURRENCY.code,
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/** Accepts "120", "120.50", "$120.50"; returns cents or null when the input is not money. */
export function parseUsdToCents(input: string | number | null | undefined): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) && input >= 0 ? Math.round(input * CURRENCY.minorUnits) : null;
  }
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\s$,\u00a0]/g, "");
  if (cleaned.length === 0) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number.parseInt(whole, 10) * CURRENCY.minorUnits + Number.parseInt((fraction + "00").slice(0, 2), 10);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function sumCents(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function lineTotalCents(unitPriceCents: number, quantity: number): number {
  return unitPriceCents * quantity;
}

export function isValidPriceInput(input: string | number | null | undefined): boolean {
  return parseUsdToCents(input) !== null;
}

export const MAX_PRICE_CENTS = 10_000_000;
