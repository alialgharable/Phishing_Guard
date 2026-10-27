import type { CartLine } from "./cart";
import { fulfilmentOptions } from "./config";
import type { OrderFailure } from "./data/repository";
import { lineTotalCents } from "./money";
import type { Product } from "./types";

/**
 * Server-side price and stock truth for the bag and checkout.
 *
 * The browser never sends a price: a quote is built from the stored product rows, and the same
 * function backs both the checkout preview and the order submission, so what a visitor saw and
 * what gets charged come from one place.
 */

export interface QuoteLine {
  productId: string;
  slug: string;
  name: string;
  sizeLabel: string | null;
  imageSrc: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  /** Stock the archive holds right now, so the UI can explain a clamp instead of hiding it. */
  availableQuantity: number;
  isOneOfAKind: boolean;
  status: "ok" | "clamped" | "gone";
  message: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: number;
  deliveryCents: number;
  totalCents: number;
  fulfilment: string;
  fulfilmentLabel: string;
  fulfilmentNote: string;
  paymentMethod: "cash_on_delivery" | "cash_on_collection";
  paymentLabel: string;
  requiresAddress: boolean;
  needsAttention: boolean;
  itemCount: number;
}

export const PAYMENT_LABELS: Record<Quote["paymentMethod"], string> = {
  cash_on_delivery: "Cash to the courier on delivery",
  cash_on_collection: "Cash on collection in Beirut",
};

export function paymentMethodFor(fulfilment: string): Quote["paymentMethod"] {
  return fulfilment === "pickup_beirut" ? "cash_on_collection" : "cash_on_delivery";
}

/**
 * The rows a quote needs. Kept narrow so the browser can build the identical quote from the public
 * `/api/catalog` projection, while the order endpoint builds it from full stored rows — one
 * function, two data sources, no room for the totals to drift apart.
 */
export type QuoteProduct = Pick<Product, "id" | "slug" | "name" | "sizeLabel" | "priceCents" | "quantity" | "archived" | "images">;

export function buildQuote(products: readonly QuoteProduct[], lines: CartLine[], fulfilment: string): Quote {
  const byId = new Map(products.map((product) => [product.id, product]));
  const option = fulfilmentOptions().find((candidate) => candidate.id === fulfilment) ?? fulfilmentOptions()[0]!;

  const quoteLines: QuoteLine[] = [];
  let subtotalCents = 0;

  for (const line of lines) {
    const product = byId.get(line.productId);
    const requested = Math.max(0, Math.trunc(line.quantity));
    if (!product || product.archived) {
      quoteLines.push({
        productId: line.productId,
        slug: "",
        name: "A piece that is no longer in the archive",
        sizeLabel: null,
        imageSrc: null,
        unitPriceCents: 0,
        quantity: requested,
        lineTotalCents: 0,
        availableQuantity: 0,
        isOneOfAKind: false,
        status: "gone",
        message: "It was removed from the archive and cannot be ordered.",
      });
      continue;
    }

    const available = Math.max(0, Math.trunc(product.quantity));
    const quantity = Math.min(requested, available);
    if (available === 0) {
      quoteLines.push({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        sizeLabel: product.sizeLabel,
        imageSrc: product.images[0]?.src ?? null,
        unitPriceCents: product.priceCents,
        quantity: requested,
        lineTotalCents: 0,
        availableQuantity: 0,
        isOneOfAKind: false,
        status: "gone",
        message: "This piece has been collected. It stays in the archive as a record only.",
      });
      continue;
    }

    const total = lineTotalCents(product.priceCents, quantity);
    subtotalCents += total;
    quoteLines.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      sizeLabel: product.sizeLabel,
      imageSrc: product.images[0]?.src ?? null,
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents: total,
      availableQuantity: available,
      isOneOfAKind: available === 1,
      status: quantity < requested ? "clamped" : "ok",
      message:
        quantity < requested
          ? available === 1
            ? "Only one exists, so the bag was reduced to one."
            : `Only ${available} left, so the bag was reduced to ${available}.`
          : null,
    });
  }

  return {
    lines: quoteLines,
    subtotalCents,
    deliveryCents: option.feeCents,
    totalCents: subtotalCents + option.feeCents,
    fulfilment: option.id,
    fulfilmentLabel: option.label,
    fulfilmentNote: option.note,
    paymentMethod: paymentMethodFor(option.id),
    paymentLabel: PAYMENT_LABELS[paymentMethodFor(option.id)],
    requiresAddress: option.requiresAddress,
    needsAttention: quoteLines.some((entry) => entry.status !== "ok"),
    itemCount: quoteLines.filter((entry) => entry.status !== "gone").reduce((total, entry) => total + entry.quantity, 0),
  };
}

/** Why an order cannot be placed, phrased for a shopper rather than for a log. */
export function describeOrderFailure(error: OrderFailure): string {
  switch (error.code) {
    case "out_of_stock":
      return error.message;
    case "price_changed":
      return `${error.message} Please review the totals before continuing.`;
    case "unavailable":
    case "invalid":
    case "empty_cart":
    default:
      return error.message;
  }
}
