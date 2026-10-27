import { describe, expect, it } from "vitest";
import { addToCart, cartCount, removeFromCart, resolveCart, setLineQuantity, subtotalCents, tidyCart } from "./cart";

const product = (id: string, quantity: number, archived = false) => ({ id, quantity, archived });

describe("addToCart", () => {
  it("adds a one-of-one piece once and refuses the second copy", () => {
    const first = addToCart([], "a", 1, 1);
    expect(first.status).toBe("added");
    expect(first.lines).toEqual([{ productId: "a", quantity: 1 }]);

    const second = addToCart(first.lines, "a", 1, 1);
    expect(second.status).toBe("max");
    expect(second.lines).toEqual([{ productId: "a", quantity: 1 }]);
  });

  it("refuses anything the archive does not hold, without touching the bag", () => {
    const result = addToCart([{ productId: "b", quantity: 1 }], "a", 0, 1);
    expect(result.status).toBe("unavailable");
    expect(result.lines).toEqual([{ productId: "b", quantity: 1 }]);
  });

  it("increases an existing line up to the available quantity only", () => {
    const increased = addToCart([{ productId: "a", quantity: 1 }], "a", 4, 2);
    expect(increased.status).toBe("increased");
    expect(increased.lines).toEqual([{ productId: "a", quantity: 3 }]);

    const clamped = addToCart(increased.lines, "a", 4, 5);
    expect(clamped.lines).toEqual([{ productId: "a", quantity: 4 }]);
  });
});

describe("quantity edits", () => {
  it("clamps to stock, removes at zero and ignores unknown lines", () => {
    expect(setLineQuantity([{ productId: "a", quantity: 1 }], "a", 9, 2)).toEqual([{ productId: "a", quantity: 2 }]);
    expect(setLineQuantity([{ productId: "a", quantity: 2 }], "a", 0, 2)).toEqual([]);
    // A generic setter: an id that was not in the bag yet is added at the clamped quantity.
    expect(setLineQuantity([{ productId: "a", quantity: 2 }], "b", 9, 3)).toEqual([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 3 },
    ]);
  });

  it("removes a line by id", () => {
    expect(removeFromCart([{ productId: "a", quantity: 1 }, { productId: "b", quantity: 2 }], "a")).toEqual([{ productId: "b", quantity: 2 }]);
  });

  it("counts only positive whole quantities", () => {
    expect(cartCount([{ productId: "a", quantity: 2.9 }, { productId: "b", quantity: -3 }])).toBe(2);
  });
});

describe("resolveCart and tidyCart", () => {
  it("marks removed, reduced and fine lines separately", () => {
    const resolved = resolveCart(
      [
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 3 },
        { productId: "gone", quantity: 1 },
      ],
      [product("a", 1), product("b", 1)],
    );
    expect(resolved.map((entry) => [entry.line.productId, entry.reason, entry.quantity])).toEqual([
      ["a", "ok", 1],
      ["b", "reduced", 1],
      ["gone", "removed", 0],
    ]);
  });

  it("drops archived products and clamps stock, reporting what changed", () => {
    const tidy = tidyCart(
      [
        { productId: "a", quantity: 4 },
        { productId: "hidden", quantity: 1 },
      ],
      [product("a", 2), { ...product("hidden", 3), archived: true }],
    );
    expect(tidy.lines).toEqual([{ productId: "a", quantity: 2 }]);
    expect(tidy.reduced).toBe(1);
    expect(tidy.removed).toBe(1);
  });

  it("sums money from the price lookup, not from the cart", () => {
    expect(subtotalCents([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }], (id) => (id === "a" ? 1500 : id === "b" ? 2500 : undefined))).toBe(5500);
    // An id the shop no longer knows about contributes nothing rather than NaN.
    expect(subtotalCents([{ productId: "ghost", quantity: 1 }], () => undefined)).toBe(0);
  });
});
