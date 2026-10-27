import { describe, expect, it } from "vitest";
import { buildQuote, describeOrderFailure, paymentMethodFor, PAYMENT_LABELS } from "./quote";
import { formatUsd, lineTotalCents, MAX_PRICE_CENTS, parseUsdToCents, sumCents } from "./money";
import { makeProduct } from "./testing/product";
import { DEFAULT_FILTERS, activeFilterCount, filtersToSearchParams, parseCatalogFilters } from "./query-params";

describe("money", () => {
  it("parses the ways a shop actually writes a price", () => {
    expect(parseUsdToCents("120")).toBe(12000);
    expect(parseUsdToCents(" 120.5 ")).toBe(12050);
    expect(parseUsdToCents("$1,204.75")).toBe(120475);
    expect(parseUsdToCents(19.99)).toBe(1999);
  });

  it("refuses anything that is not money rather than rounding it into money", () => {
    for (const input of ["", "abc", "12.345", "-5", "1e3", "0x10", null, undefined, NaN, Infinity]) {
      expect(parseUsdToCents(input as string | number | null)).toBeNull();
    }
  });

  it("keeps whole prices whole on screen and cents visible when they exist", () => {
    expect(formatUsd(12000)).toBe("$120");
    expect(formatUsd(12050)).toBe("$120.50");
    expect(formatUsd(0)).toBe("$0");
  });

  it("adds line totals in cents only", () => {
    expect(lineTotalCents(1999, 3)).toBe(5997);
    expect(sumCents([100, 2500, 50])).toBe(2650);
    expect(MAX_PRICE_CENTS).toBeGreaterThan(1_000_000);
  });
});

describe("buildQuote", () => {
  const products = [makeProduct({ id: "a", priceCents: 38000, quantity: 1 }), makeProduct({ id: "b", priceCents: 9000, quantity: 3 })];

  it("prices from the product rows, never from the caller", () => {
    const quote = buildQuote(products, [{ productId: "a", quantity: 1 }], "pickup_beirut");
    expect(quote.subtotalCents).toBe(38000);
    expect(quote.deliveryCents).toBe(0);
    expect(quote.totalCents).toBe(38000);
    expect(quote.paymentMethod).toBe("cash_on_collection");
    expect(quote.paymentLabel).toBe(PAYMENT_LABELS.cash_on_collection);
    expect(quote.requiresAddress).toBe(false);
    expect(quote.needsAttention).toBe(false);
  });

  it("adds the configured courier fee and demands an address with it", () => {
    const quote = buildQuote(products, [{ productId: "b", quantity: 2 }], "courier_beirut");
    expect(quote.deliveryCents).toBe(500);
    expect(quote.totalCents).toBe(18000 + 500);
    expect(quote.requiresAddress).toBe(true);
    expect(quote.paymentMethod).toBe("cash_on_delivery");
  });

  it("clamps a quantity the archive cannot supply and says so", () => {
    const quote = buildQuote(products, [{ productId: "a", quantity: 2 }], "pickup_beirut");
    const line = quote.lines[0]!;
    expect(line.status).toBe("clamped");
    expect(line.quantity).toBe(1);
    expect(line.lineTotalCents).toBe(38000);
    expect(line.message).toMatch(/only one exists/i);
    expect(quote.needsAttention).toBe(true);
  });

  it("keeps collected and removed pieces out of the total", () => {
    const quote = buildQuote(
      [...products, makeProduct({ id: "c", quantity: 0 })],
      [
        { productId: "c", quantity: 1 },
        { productId: "ghost", quantity: 2 },
        { productId: "b", quantity: 1 },
      ],
      "pickup_beirut",
    );
    expect(quote.lines.map((line) => line.status)).toEqual(["gone", "gone", "ok"]);
    expect(quote.subtotalCents).toBe(9000);
    expect(quote.itemCount).toBe(1);
    expect(quote.needsAttention).toBe(true);
  });

  it("falls back to the shop's first method when the id is unknown", () => {
    const quote = buildQuote(products, [{ productId: "b", quantity: 1 }], "telepathy");
    expect(quote.fulfilment).toBe("pickup_beirut");
  });
});

describe("payment naming", () => {
  it("maps only the two methods this shop performs", () => {
    expect(paymentMethodFor("pickup_beirut")).toBe("cash_on_collection");
    expect(paymentMethodFor("courier_lebanon")).toBe("cash_on_delivery");
    expect(paymentMethodFor("anything-else")).toBe("cash_on_delivery");
    expect(Object.keys(PAYMENT_LABELS)).toEqual(["cash_on_delivery", "cash_on_collection"]);
  });

  it("phrases an order failure for a shopper", () => {
    expect(describeOrderFailure({ code: "out_of_stock", message: "Only 1 of “Coat” is left." })).toBe("Only 1 of “Coat” is left.");
    expect(describeOrderFailure({ code: "price_changed", message: "The price moved" })).toMatch(/review the totals/i);
    expect(describeOrderFailure({ code: "empty_cart", message: "The bag is empty." })).toBe("The bag is empty.");
  });
});

describe("URL <-> filters", () => {
  it("ignores unknown and malformed query values instead of throwing", () => {
    const filters = parseCatalogFilters({ category: "not-a-category", sort: "sideways", max: "-40", includeCollected: "maybe", q: "  coat  " });
    expect(filters.category).toBe("all");
    expect(filters.sort).toBe("newest");
    expect(filters.maxPriceCents).toBeNull();
    expect(filters.includeCollected).toBe(false);
    expect(filters.search).toBe("  coat  ");
  });

  it("keeps only non-default values in the URL and round-trips the rest", () => {
    const filters = { ...DEFAULT_FILTERS, category: "shirts" as const, maxPriceCents: 15000, includeCollected: true, sort: "price-asc" as const };
    const query = filtersToSearchParams(filters);
    expect(query).toBe("?category=shirts&max=150&includeCollected=1&sort=price-asc");
    const back = parseCatalogFilters(Object.fromEntries(new URLSearchParams(query)));
    expect(back).toEqual({ ...filters, search: "" });
    expect(filtersToSearchParams(DEFAULT_FILTERS)).toBe("");
  });

  it("counts the active filters the way the reset button needs to", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, search: "  ", sort: "name" })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, search: "coat", size: "M" })).toBe(2);
  });
});
