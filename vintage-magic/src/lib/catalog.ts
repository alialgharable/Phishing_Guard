import type { Availability, CatalogFilters, Product, SortId } from "./types";
import { CATEGORY_LABELS, GENDER_LABELS } from "./types";

/**
 * Availability is derived, never stored twice: quantity is the single source of truth and
 * every label ("1 of 1", "COLLECTED") is computed from it. Sold out pieces remain visible as
 * archive records but can never be ordered.
 */
export function availabilityOf(product: Pick<Product, "quantity">): Availability {
  const quantity = Math.max(0, Math.trunc(product.quantity));
  const isOneOfAKind = quantity === 1;
  const isInStock = quantity > 0;
  return {
    quantity,
    isOneOfAKind,
    isInStock,
    collected: !isInStock,
    label: !isInStock ? "COLLECTED" : isOneOfAKind ? "ONE OF ONE" : `${quantity} IN STOCK`,
  };
}

/** What a buyer may add to a bag right now, given what the archive still holds. */
export function purchasableQuantity(product: Pick<Product, "quantity">, requested = 1): number {
  const available = availabilityOf(product).quantity;
  return Math.max(0, Math.min(Math.trunc(requested) || 0, available));
}

export interface FilterResult {
  products: Product[];
  total: number;
  collectedCount: number;
  maxAvailablePriceCents: number;
  sizes: string[];
  activeChips: Array<{ key: string; label: string }>;
}

/**
 * Pure catalog query used by both the server render and the client filter panel, so the two
 * can never disagree about what a filter means.
 */
export function applyCatalogQuery(products: Product[], filters: Partial<CatalogFilters>): FilterResult {
  const search = (filters.search ?? "").trim().toLocaleLowerCase();
  const includeCollected = filters.includeCollected ?? false;

  const live = products.filter((product) => !product.archived);
  const maxAvailablePriceCents = live.length > 0 ? Math.max(...live.map((product) => product.priceCents)) : 0;
  const sizes = [...new Set(live.map((product) => product.sizeLabel).filter((size): size is string => size !== null && size.length > 0))].sort(compareSizes);

  let matched = live.filter((product) => {
    const availability = availabilityOf(product);
    if (!includeCollected && availability.collected) return false;

    if (filters.category && filters.category !== "all" && !product.categories.includes(filters.category)) return false;
    if (filters.gender && filters.gender !== "all" && !product.genders.includes(filters.gender)) return false;
    if (filters.size && filters.size !== "all" && (product.sizeLabel ?? "") !== filters.size) return false;
    if (typeof filters.maxPriceCents === "number" && filters.maxPriceCents > 0 && product.priceCents > filters.maxPriceCents) return false;

    if (search.length > 0) {
      const haystack = [
        product.name,
        product.era ?? "",
        product.description ?? "",
        product.sizeLabel ?? "",
        product.provenance ?? "",
        ...product.categories.map((category) => CATEGORY_LABELS[category]),
        ...product.genders.map((gender) => GENDER_LABELS[gender]),
      ]
        .join(" ")
        .toLocaleLowerCase();
      const terms = search.split(/\s+/).filter((term) => term.length > 0);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });

  matched = sortProducts(matched, filters.sort ?? "newest");

  const activeChips: FilterResult["activeChips"] = [];
  if (filters.category && filters.category !== "all") activeChips.push({ key: "category", label: CATEGORY_LABELS[filters.category] });
  if (filters.gender && filters.gender !== "all") activeChips.push({ key: "gender", label: GENDER_LABELS[filters.gender] });
  if (filters.size && filters.size !== "all") activeChips.push({ key: "size", label: `Size ${filters.size}` });
  if (typeof filters.maxPriceCents === "number" && filters.maxPriceCents > 0) activeChips.push({ key: "maxPriceCents", label: "Under price cap" });
  if (includeCollected) activeChips.push({ key: "includeCollected", label: "Incl. collected" });
  if (search.length > 0) activeChips.push({ key: "search", label: `“${filters.search?.trim()}”` });

  return {
    products: matched,
    total: matched.length,
    collectedCount: live.filter((product) => availabilityOf(product).collected).length,
    maxAvailablePriceCents,
    sizes,
    activeChips,
  };
}

export function sortProducts(products: Product[], sort: SortId): Product[] {
  const copy = [...products];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => a.priceCents - b.priceCents || a.name.localeCompare(b.name));
    case "price-desc":
      return copy.sort((a, b) => b.priceCents - a.priceCents || a.name.localeCompare(b.name));
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "newest":
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
  }
}

/** Letter scale first, then numeric sizes ascending, then "one size" and anything unusual. */
export function compareSizes(a: string, b: string): number {
  const rank = (size: string): number => {
    const key = size.trim().toUpperCase();
    const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
    const index = order.indexOf(key);
    if (index !== -1) return index;
    if (key === "ONE SIZE" || key === "ONESIZE" || key === "FREE") return order.length + 1;
    return order.length;
  };
  const numeric = (size: string): number | null => {
    const match = /^(\d+(?:\.\d+)?)/.exec(size.trim());
    return match ? Number(match[1]) : null;
  };
  const rankA = rank(a);
  const rankB = rank(b);
  if (rankA !== rankB) return rankA - rankB;
  const numA = numeric(a);
  const numB = numeric(b);
  if (numA !== null && numB !== null && numA !== numB) return numA - numB;
  return a.localeCompare(b);
}

/** A garment the buyer already has in the bag cannot be reserved twice. */
export function canAddToBag(product: Pick<Product, "quantity" | "archived">, currentQuantityInBag: number): boolean {
  if (product.archived) return false;
  return availabilityOf(product).quantity - currentQuantityInBag > 0;
}
