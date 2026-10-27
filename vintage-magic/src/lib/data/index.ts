import { env } from "../config";
import { LocalRepository } from "./local";
import { SupabaseRepository, supabaseConfigured } from "./supabase";
import type { CatalogRepository } from "./repository";

export type { CatalogRepository, NewProductInput, PlaceOrderInput, PlaceOrderResult, ProductPatch } from "./repository";
export { SAMPLE_DATA_NOTICE } from "./sample-products";

/**
 * The single place that decides where the shop's data comes from.
 *
 * Supabase is used the moment both credentials exist; otherwise the file-backed store keeps
 * the site genuinely functional for development. Nothing in the UI branches on this - both
 * repositories enforce the same availability and pricing rules behind their own `placeOrder`.
 */
let cached: CatalogRepository | null = null;

export function getRepository(): CatalogRepository {
  if (cached) return cached;
  if (env("VINTAGE_FORCE_LOCAL_DATA") === "1") {
    cached = new LocalRepository();
    return cached;
  }
  cached = supabaseConfigured() ? new SupabaseRepository() : new LocalRepository();
  return cached;
}

export function repositoryKind(): CatalogRepository["kind"] {
  return getRepository().kind;
}

/** True when the shop is serving the sample archive rather than store data. */
export function servingSampleData(): boolean {
  return repositoryKind() === "local" && env("VINTAGE_SAMPLE_MODE") !== "off";
}
