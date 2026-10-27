import type { Product } from "../types";

/**
 * Test fixture only (never imported by the app). A single place to build a valid product keeps the
 * assertions about stock, price and filtering readable.
 */
export function makeProduct(overrides: Partial<Product> & { id: string }): Product {
  return {
    slug: overrides.id,
    name: `Piece ${overrides.id}`,
    era: "1970s",
    categories: ["jackets"],
    genders: ["unisex"],
    sizeLabel: "M",
    measurements: [{ label: "Chest", value: "52 cm" }],
    condition: "Worn soft, one replaced button.",
    description: "A jacket with a story.",
    priceCents: 12000,
    quantity: 1,
    images: [{ src: "/media/hero-coat.jpg", alt: "Coat on a hanger" }],
    diagram: "coat",
    annotations: [],
    featured: false,
    archived: false,
    provenance: null,
    createdAt: "2024-03-01T09:00:00.000Z",
    updatedAt: "2024-03-01T09:00:00.000Z",
    ...overrides,
  };
}
