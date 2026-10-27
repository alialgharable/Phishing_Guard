/**
 * Domain types for the Vintage Magic Beirut archive.
 *
 * `null` is used deliberately for anything the shop has not recorded. The UI must hide a
 * null field rather than present a guess, so "unknown" never reads as a fact about a garment.
 */

export const CATEGORIES = ["jackets", "shirts", "trousers", "dresses", "accessories"] as const;
export type CategoryId = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  jackets: "Jackets & Coats",
  shirts: "Shirts & Knits",
  trousers: "Trousers & Skirts",
  dresses: "Dresses",
  accessories: "Accessories",
};

export const GENDERS = ["women", "men", "unisex"] as const;
export type GenderId = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<GenderId, string> = {
  women: "Women",
  men: "Men",
  unisex: "Unisex",
};

export interface ProductImage {
  /** Site-relative path (served from /public) or an absolute URL in a Supabase Storage bucket. */
  src: string;
  alt: string;
}

export interface Measurement {
  label: string;
  value: string;
}

/**
 * A small handwritten-style note pinned to the primary image. Coordinates are fractions
 * of the image box (0-1) so the annotation follows the garment at every viewport size.
 */
export interface GarmentAnnotation {
  label: string;
  note: string;
  x: number;
  y: number;
  /** Side of the image the leader line escapes to. */
  side: "left" | "right";
}

/**
 * Technical cut diagrams drawn as SVG rather than photographed. Several archive entries are
 * documented this way - either because no studio day has happened yet, or because the flat
 * pattern says more about the cut than a photo does. It is a first-class plate type, not a
 * placeholder for a missing image.
 */
export const DIAGRAMS = ["coat", "jacket", "shirt", "trousers", "skirt", "dress", "scarf", "purse"] as const;
export type DiagramId = (typeof DIAGRAMS)[number];

export const DIAGRAM_LABELS: Record<DiagramId, string> = {
  coat: "Coat block, double-breasted",
  jacket: "Jacket front, asymmetric closure",
  shirt: "Camp shirt, one-piece collar",
  trousers: "Wide trouser, two-piece leg",
  skirt: "Circular skirt, panel join",
  dress: "Bias slip, strap detail",
  scarf: "Square, rolled hem",
  purse: "Frame bag, beaded field",
};

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** Decade or year as the shop records it, e.g. "1970s". */
  era: string | null;
  categories: CategoryId[];
  genders: GenderId[];
  sizeLabel: string | null;
  measurements: Measurement[];
  /** Honest condition note from the person who handled the garment. */
  condition: string | null;
  description: string | null;
  /** Price in USD minor units (cents) so arithmetic never touches floats. */
  priceCents: number;
  quantity: number;
  images: ProductImage[];
  /** Optional archival cut diagram, shown as a plate in the gallery. */
  diagram: DiagramId | null;
  annotations: GarmentAnnotation[];
  featured: boolean;
  /** Archived pieces stay in the record but leave the public archive. */
  archived: boolean;
  /** Free-text provenance the shop chooses to publish, e.g. "Beirut rooftop auction lot". */
  provenance: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderLine {
  productId: string;
  slug: string;
  name: string;
  sizeLabel: string | null;
  unitPriceCents: number;
  quantity: number;
  imageSrc: string | null;
}

export type OrderStatus = "placed" | "reserved" | "confirmed" | "dispatched" | "collected" | "cancelled";

export const ORDER_STATUSES = ["placed", "reserved", "confirmed", "dispatched", "collected", "cancelled"] as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Placed",
  reserved: "Held for payment",
  confirmed: "Confirmed",
  dispatched: "On the way",
  collected: "Collected",
  cancelled: "Cancelled",
};

export type FulfilmentId = "pickup_beirut" | "courier_beirut" | "courier_lebanon";

export interface FulfilmentOption {
  id: FulfilmentId;
  label: string;
  note: string;
  /** Cents; 0 means free, not unknown. */
  feeCents: number;
  area: string;
  requiresAddress: boolean;
}

export interface CustomerDetails {
  name: string;
  phone: string;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
}

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  lines: OrderLine[];
  customer: CustomerDetails;
  fulfilment: FulfilmentId;
  fulfilmentLabel: string;
  /** Cash on delivery / on collection: no online payment is implied anywhere. */
  paymentMethod: "cash_on_delivery" | "cash_on_collection";
  subtotalCents: number;
  deliveryCents: number;
  totalCents: number;
  /** Idempotency key so a double-submitted checkout cannot reserve twice. */
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  topic: "general" | "sizing" | "pickup" | "press" | "atelier";
  body: string;
  createdAt: string;
  handled: boolean;
}

export interface SiteContent {
  /** Contact channels the owner has actually supplied. Empty means "not configured". */
  phone: string | null;
  email: string | null;
  instagram: string | null;
  whatsapp: string | null;
  addressLine: string | null;
  hours: string | null;
  aboutHeading: string;
  aboutParagraphs: string[];
  atelierTeaserEnabled: boolean;
  atelierTeaserCopy: string;
}

export interface CatalogFilters {
  search: string;
  category: CategoryId | "all";
  gender: GenderId | "all";
  size: string | "all";
  maxPriceCents: number | null;
  includeCollected: boolean;
  sort: SortId;
}

export const SORTS = ["newest", "price-asc", "price-desc", "name"] as const;
export type SortId = (typeof SORTS)[number];

export const SORT_LABELS: Record<SortId, string> = {
  newest: "Recently added",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
  name: "A–Z",
};

/** Everything the shop knows about stock for one product, derived in one place. */
export interface Availability {
  quantity: number;
  isOneOfAKind: boolean;
  isInStock: boolean;
  /** Sold out, but still shown as part of the archive record. */
  collected: boolean;
  label: string;
}

/**
 * The subset of a product row the browser needs to price a bag. Structurally compatible with the
 * server's `QuoteProduct`, so the client preview and the server order use the same quote function
 * on the same field names - and the browser still never supplies a price.
 */
export interface PublicProduct extends Pick<Product, "id" | "slug" | "name" | "sizeLabel" | "priceCents" | "quantity" | "archived" | "images"> {
  era: string | null;
  categories: CategoryId[];
  diagram: DiagramId | null;
}
