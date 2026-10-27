import type { ContactMessage, Order, OrderStatus, Product, SiteContent } from "../types";

/**
 * One repository contract, two implementations: a file-backed store for development and a
 * Postgres/Supabase store for production. The application - pages, API routes, admin - never
 * knows which one it is talking to, so availability and pricing rules cannot drift between
 * environments.
 */
export type RepositoryKind = "local" | "supabase";

export interface NewProductInput {
  name: string;
  slug?: string;
  era: string | null;
  categories: Product["categories"];
  genders: Product["genders"];
  sizeLabel: string | null;
  measurements: Product["measurements"];
  condition: string | null;
  description: string | null;
  priceCents: number;
  quantity: number;
  images: Product["images"];
  /** Optional archival cut diagram. */
  diagram?: Product["diagram"];
  featured: boolean;
  archived: boolean;
  provenance: string | null;
}

export type ProductPatch = Partial<Omit<NewProductInput, "images">> & { images?: Product["images"] };

export interface OrderFailure {
  code: "out_of_stock" | "price_changed" | "empty_cart" | "unavailable" | "invalid";
  message: string;
  /** Which line the failure belongs to, when the failure is line-specific. */
  productId?: string;
  /** What the archive now holds for that piece, so the bag can be corrected honestly. */
  availableQuantity?: number;
  currentPriceCents?: number;
}

export interface PlaceOrderInput {
  lines: Array<{ productId: string; quantity: number }>;
  customer: Order["customer"];
  fulfilment: Order["fulfilment"];
  paymentMethod: Order["paymentMethod"];
  idempotencyKey?: string | null;
}

export type PlaceOrderResult = { ok: true; order: Order } | { ok: false; error: OrderFailure };

export interface CatalogRepository {
  readonly kind: RepositoryKind;
  listProducts(): Promise<Product[]>;
  findProductBySlug(slug: string): Promise<Product | null>;
  findProductById(id: string): Promise<Product | null>;
  createProduct(input: NewProductInput): Promise<Product>;
  updateProduct(id: string, patch: ProductPatch): Promise<Product | null>;
  deleteProduct(id: string): Promise<boolean>;
  setQuantity(id: string, quantity: number): Promise<Product | null>;
  listOrders(): Promise<Order[]>;
  findOrderById(id: string): Promise<Order | null>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null>;
  /** Validates stock and price on the server, then decrements atomically. */
  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  listMessages(): Promise<ContactMessage[]>;
  createMessage(input: Omit<ContactMessage, "id" | "createdAt" | "handled">): Promise<ContactMessage>;
  markMessageHandled(id: string, handled: boolean): Promise<ContactMessage | null>;
  getSiteContent(): Promise<SiteContent>;
  saveSiteContent(patch: Partial<SiteContent>): Promise<SiteContent>;
}
