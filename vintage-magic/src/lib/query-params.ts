import { CATEGORIES, GENDERS, SORTS, type CatalogFilters, type CategoryId, type GenderId, type SortId } from "./types";
import { priceCapFrom, booleanParam, pickFrom, pickOptionalEnum } from "./validation";

/**
 * One mapping between the URL and the filter object, used by the server render and by the client
 * filter panel. The archive can therefore be linked, shared and reloaded ("?category=shirts&sort=price-asc")
 * without the two halves ever disagreeing about what a query string means.
 */

export const DEFAULT_FILTERS: CatalogFilters = {
  search: "",
  category: "all",
  gender: "all",
  size: "all",
  maxPriceCents: null,
  includeCollected: false,
  sort: "newest",
};

type SearchParamsLike = Record<string, string | string[] | undefined>;

export function parseCatalogFilters(params: SearchParamsLike): CatalogFilters {
  return {
    search: typeof params.q === "string" ? params.q.slice(0, 80) : "",
    category: pickOptionalEnum<CategoryId>(params.category, CATEGORIES),
    gender: pickOptionalEnum<GenderId>(params.gender, GENDERS),
    size: typeof params.size === "string" && params.size !== "all" ? params.size.slice(0, 24) : "all",
    maxPriceCents: priceCapFrom(params.max),
    includeCollected: booleanParam(params.includeCollected),
    sort: pickFrom<SortId>(params.sort, SORTS, "newest"),
  };
}

/** Only non-default values reach the URL, so links stay readable. */
export function filtersToSearchParams(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.gender !== "all") params.set("gender", filters.gender);
  if (filters.size !== "all") params.set("size", filters.size);
  if (typeof filters.maxPriceCents === "number") params.set("max", String(filters.maxPriceCents / 100));
  if (filters.includeCollected) params.set("includeCollected", "1");
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function activeFilterCount(filters: CatalogFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.category !== "all") count += 1;
  if (filters.gender !== "all") count += 1;
  if (filters.size !== "all") count += 1;
  if (typeof filters.maxPriceCents === "number") count += 1;
  if (filters.includeCollected) count += 1;
  return count;
}

/** Used by the server for a `<link rel="canonical">`-ish hint and by the client for one key. */
export function filtersKey(filters: CatalogFilters): string {
  return JSON.stringify([filters.search.trim(), filters.category, filters.gender, filters.size, filters.maxPriceCents ?? 0, filters.includeCollected, filters.sort]);
}
