import type { Product, PublicProduct } from "../types";

/**
 * The single projection from a stored product row to the shape the browser is allowed to price a bag
 * with. Used by `/api/catalog`, the bag page and the checkout page, so the three can never disagree
 * about which fields exist - and none of them hands a price to the client as an input.
 */
export function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    era: product.era,
    categories: product.categories,
    sizeLabel: product.sizeLabel,
    priceCents: product.priceCents,
    quantity: product.quantity,
    images: product.images,
    diagram: product.diagram,
    archived: product.archived,
  };
}

export function publicProducts(products: readonly Product[], options: { includeArchived?: boolean } = {}): PublicProduct[] {
  const keep = options.includeArchived === true ? products : products.filter((product) => !product.archived);
  return keep.map(toPublicProduct);
}
