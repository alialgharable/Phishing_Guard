import type { FulfilmentOption, PublicProduct } from "@/lib/types";

/**
 * Client-side readers for the two public endpoints.
 *
 * Every URL is relative: the browser only ever talks to the origin that served the page, which is
 * what makes the same build work behind the preview proxy, on localhost and in production without a
 * config value.
 */

export interface CatalogResponse {
  products: PublicProduct[];
  categories: Array<{ id: string; label: string }>;
}

export interface CatalogConfig {
  brand: { name: string; city: string };
  currency: { code: string; symbol: string };
  fulfilment: FulfilmentOption[];
  note: string;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return (await response.json()) as T;
}

export function readCatalog(): Promise<CatalogResponse> {
  return getJson<CatalogResponse>("/api/catalog");
}

export function readConfig(): Promise<CatalogConfig> {
  return getJson<CatalogConfig>("/api/config");
}

export const FULFILMENT_FALLBACK_NOTE = "Fulfilment methods are set by the shop in its configuration.";
