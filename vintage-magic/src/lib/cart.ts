/**
 * Cart maths, kept pure and browser-safe so the same functions run in the bag provider, in the
 * checkout page and in tests. Prices always come from the product record the server supplied -
 * the cart stores ids and quantities only, never money.
 */

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartLineResolution<T> {
  line: CartLine;
  product: T | null;
  quantity: number;
  reason: "ok" | "removed" | "reduced";
}

export type AddResult = { status: "added" | "increased"; lines: CartLine[]; message: string } | { status: "unavailable" | "max"; lines: CartLine[]; message: string };

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + Math.max(0, Math.trunc(line.quantity)), 0);
}

export function addToCart(lines: CartLine[], productId: string, available: number, requested = 1): AddResult {
  const existing = lines.find((line) => line.productId === productId);
  const current = existing?.quantity ?? 0;
  if (available <= 0) {
    return { status: "unavailable", lines, message: "This piece has already been collected." };
  }
  const target = Math.min(current + Math.max(1, Math.trunc(requested)), available);
  if (target === current) {
    return {
      status: "max",
      lines,
      message: available === 1 ? "You already have the only one in your bag." : `Only ${available} in the archive.`,
    };
  }
  const next: CartLine[] = existing
    ? lines.map((line) => (line.productId === productId ? { ...line, quantity: target } : line))
    : [...lines, { productId, quantity: target }];
  return {
    status: current === 0 ? "added" : "increased",
    lines: next,
    message: current === 0 ? (available === 1 ? "Added to your bag - one of one." : "Added to your bag.") : `Now ${target} in your bag.`,
  };
}

export function setLineQuantity(lines: CartLine[], productId: string, quantity: number, available: number): CartLine[] {
  const target = Math.min(Math.max(0, Math.trunc(quantity)), Math.max(0, available));
  if (target === 0) return removeFromCart(lines, productId);
  if (!lines.some((line) => line.productId === productId)) return [...lines, { productId, quantity: target }];
  return lines.map((line) => (line.productId === productId ? { ...line, quantity: target } : line));
}

export function removeFromCart(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

export function clearCart(): CartLine[] {
  return [];
}

/**
 * Reconcile a stored cart against what the archive currently holds: pieces that were deleted,
 * archived or collected are dropped, and quantities are clamped to what is actually left. This
 * is what keeps a bag that survived a night in localStorage honest.
 */
export function resolveCart<T extends { id: string; quantity: number; archived: boolean }>(lines: CartLine[], products: readonly T[]): Array<CartLineResolution<T>> {
  const byId = new Map(products.map((product) => [product.id, product]));
  const resolved: Array<CartLineResolution<T>> = [];
  for (const line of lines) {
    const product = byId.get(line.productId) ?? null;
    if (!product || product.archived || product.quantity <= 0) {
      resolved.push({ line, product: null, quantity: 0, reason: "removed" });
      continue;
    }
    const quantity = Math.min(Math.max(1, Math.trunc(line.quantity)), product.quantity);
    resolved.push({ line: { ...line, quantity }, product, quantity, reason: quantity < line.quantity ? "reduced" : "ok" });
  }
  return resolved;
}

export function tidyCart<T extends { id: string; quantity: number; archived: boolean }>(lines: CartLine[], products: readonly T[]): { lines: CartLine[]; removed: number; reduced: number } {
  const resolved = resolveCart(lines, products);
  const kept = resolved.filter((entry) => entry.reason !== "removed");
  return {
    lines: kept.map((entry) => entry.line),
    removed: lines.length - kept.length,
    reduced: kept.filter((entry) => entry.reason === "reduced").length,
  };
}

export function subtotalCents(lines: CartLine[], priceOf: (productId: string) => number | undefined): number {
  return lines.reduce((total, line) => total + (priceOf(line.productId) ?? 0) * Math.max(0, Math.trunc(line.quantity)), 0);
}
