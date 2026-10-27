import { describe, expect, it } from "vitest";
import { availabilityOf, applyCatalogQuery, canAddToBag, compareSizes, purchasableQuantity, sortProducts } from "./catalog";
import { makeProduct } from "./testing/product";
import type { Product } from "./types";

describe("availability", () => {
  it("calls a single remaining piece one of one", () => {
    const availability = availabilityOf({ quantity: 1 });
    expect(availability).toMatchObject({ isOneOfAKind: true, isInStock: true, collected: false });
    expect(availability.label).toMatch(/one of one/i);
  });

  it("calls zero quantity collected, never sold-out-with-a-buy-path", () => {
    const availability = availabilityOf({ quantity: 0 });
    expect(availability.collected).toBe(true);
    expect(availability.isInStock).toBe(false);
    expect(availability.label).toMatch(/collected/i);
  });

  it("caps what can be bought at what the archive holds", () => {
    expect(purchasableQuantity({ quantity: 3 }, 5)).toBe(3);
    expect(purchasableQuantity({ quantity: 0 }, 1)).toBe(0);
    expect(purchasableQuantity({ quantity: 12 }, 1)).toBe(1);
  });

  it("refuses a second one-of-one add and allows a repeat when stock remains", () => {
    expect(canAddToBag({ quantity: 1, archived: false }, 1)).toBe(false);
    expect(canAddToBag({ quantity: 3, archived: false }, 2)).toBe(true);
    expect(canAddToBag({ quantity: 5, archived: true }, 0)).toBe(false);
    expect(canAddToBag({ quantity: 0, archived: false }, 0)).toBe(false);
  });
});

const ARCHIVE: Product[] = [
  makeProduct({ id: "a", name: "Leather jacket", priceCents: 38000, quantity: 1, categories: ["jackets"], genders: ["women"], sizeLabel: "S", era: "1980s" }),
  makeProduct({ id: "b", name: "Silk shirt", priceCents: 9000, quantity: 2, categories: ["shirts"], genders: ["men", "unisex"], sizeLabel: "L", era: "1970s" }),
  makeProduct({ id: "c", name: "Wide trousers", priceCents: 14000, quantity: 0, categories: ["trousers"], genders: ["unisex"], sizeLabel: "M", era: "1990s" }),
  makeProduct({ id: "d", name: "Archive coat", priceCents: 22000, quantity: 1, categories: ["jackets"], genders: ["unisex"], sizeLabel: "XL", archived: true }),
];

describe("applyCatalogQuery", () => {
  it("hides archived rows and collected pieces, but not when collected are asked for", () => {
    expect(applyCatalogQuery(ARCHIVE, {}).products.map((product) => product.id)).toEqual(["a", "b"]);
    expect(applyCatalogQuery(ARCHIVE, { includeCollected: true }).products.map((product) => product.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by category, gender and size together", () => {
    expect(applyCatalogQuery(ARCHIVE, { category: "shirts" }).total).toBe(1);
    expect(applyCatalogQuery(ARCHIVE, { gender: "women" }).products.map((product) => product.id)).toEqual(["a"]);
    expect(applyCatalogQuery(ARCHIVE, { size: "M" }).products).toHaveLength(0);
    expect(applyCatalogQuery(ARCHIVE, { size: "M", includeCollected: true }).products.map((product) => product.id)).toEqual(["c"]);
  });

  it("matches every search term against name, era, description and provenance", () => {
    expect(applyCatalogQuery(ARCHIVE, { search: "leather 1980s" }).total).toBe(1);
    expect(applyCatalogQuery(ARCHIVE, { search: "story silk" }).total).toBe(1);
    expect(applyCatalogQuery(ARCHIVE, { search: "denim" }).total).toBe(0);
  });

  it("applies a price ceiling and reports the facets the UI needs", () => {
    const result = applyCatalogQuery(ARCHIVE, { maxPriceCents: 15000 });
    expect(result.products.map((product) => product.id)).toEqual(["b"]);
    expect(result.maxAvailablePriceCents).toBe(38000);
    expect(result.sizes).toEqual(["S", "M", "L"]);
    expect(result.activeChips.map((chip) => chip.key)).toContain("maxPriceCents");
  });

  it("reports one chip per active filter so the count and the UI cannot disagree", () => {
    const result = applyCatalogQuery(ARCHIVE, { search: "silk", category: "shirts", gender: "men", includeCollected: true });
    expect(result.activeChips.map((chip) => chip.key).sort()).toEqual(["category", "gender", "includeCollected", "search"]);
  });

  it("sorts by price both ways and by name, without mutating the input", () => {
    const before = ARCHIVE.map((product) => product.id);
    expect(sortProducts(ARCHIVE, "price-asc").map((product) => product.priceCents)).toEqual([9000, 14000, 22000, 38000]);
    expect(sortProducts(ARCHIVE, "price-desc")[0]?.priceCents).toBe(38000);
    expect(sortProducts(ARCHIVE, "name").map((product) => product.name)).toEqual(["Archive coat", "Leather jacket", "Silk shirt", "Wide trousers"]);
    expect(ARCHIVE.map((product) => product.id)).toEqual(before);
  });

  it("orders newest first by the recorded date", () => {
    const dated = [
      makeProduct({ id: "old", createdAt: "2023-01-01T00:00:00.000Z" }),
      makeProduct({ id: "new", createdAt: "2024-06-01T00:00:00.000Z" }),
    ];
    expect(applyCatalogQuery(dated, { sort: "newest" }).products.map((product) => product.id)).toEqual(["new", "old"]);
  });
});

describe("compareSizes", () => {
  it("puts the letter scale first, numerics in order, and one size last", () => {
    expect(["38", "One size", "44", "M", "S"].sort(compareSizes)).toEqual(["S", "M", "38", "44", "One size"]);
    expect(["XL", "One size", "XXS"].sort(compareSizes)).toEqual(["XXS", "XL", "One size"]);
    // An unusual label still sorts deterministically rather than throwing the facet list into noise.
    expect(["N/A", "S"].sort(compareSizes)).toEqual(["S", "N/A"]);
  });
});
