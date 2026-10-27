import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SITE_CONTENT, env, fulfilmentOptions } from "../config";
import type { ContactMessage, Order, OrderStatus, Product, SiteContent } from "../types";
import type { CatalogRepository, NewProductInput, PlaceOrderInput, PlaceOrderResult, ProductPatch } from "./repository";

/**
 * Supabase / Postgres adapter. Selected automatically when both `NEXT_PUBLIC_SUPABASE_URL`
 * and `SUPABASE_SERVICE_ROLE_KEY` are present; see `supabase/schema.sql` for the schema,
 * constraints, indexes, RLS policies and the `place_order` transaction this class calls.
 *
 * The service-role key is read from a non-`NEXT_PUBLIC_` variable so it can never be inlined
 * into a browser bundle. Public reads go through the anon key and RLS in the browser if a
 * deployment wants that; this server path is the one the shop and admin use.
 */

const PRODUCT_COLUMNS =
  "id, slug, name, era, categories, genders, size_label, measurements, condition, description, price_cents, quantity, images, diagram, annotations, featured, archived, provenance, created_at, updated_at";

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  era: string | null;
  categories: string[] | null;
  genders: string[] | null;
  size_label: string | null;
  measurements: unknown;
  condition: string | null;
  description: string | null;
  price_cents: number;
  quantity: number;
  images: unknown;
  diagram: string | null;
  annotations: unknown;
  featured: boolean;
  archived: boolean;
  provenance: string | null;
  created_at: string;
  updated_at: string;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    era: row.era,
    categories: Array.isArray(row.categories) ? (row.categories as Product["categories"]) : [],
    genders: Array.isArray(row.genders) ? (row.genders as Product["genders"]) : ["unisex"],
    sizeLabel: row.size_label,
    measurements: Array.isArray(row.measurements) ? (row.measurements as Product["measurements"]) : [],
    condition: row.condition,
    description: row.description,
    priceCents: row.price_cents,
    quantity: row.quantity,
    images: Array.isArray(row.images) ? (row.images as Product["images"]) : [],
    diagram: row.diagram as Product["diagram"],
    annotations: Array.isArray(row.annotations) ? (row.annotations as Product["annotations"]) : [],
    featured: row.featured,
    archived: row.archived,
    provenance: row.provenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(input: Partial<NewProductInput> & Partial<ProductPatch>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.slug !== undefined) row.slug = input.slug;
  if (input.era !== undefined) row.era = input.era;
  if (input.categories !== undefined) row.categories = input.categories;
  if (input.genders !== undefined) row.genders = input.genders;
  if (input.sizeLabel !== undefined) row.size_label = input.sizeLabel;
  if (input.measurements !== undefined) row.measurements = input.measurements;
  if (input.condition !== undefined) row.condition = input.condition;
  if (input.description !== undefined) row.description = input.description;
  if (input.priceCents !== undefined) row.price_cents = input.priceCents;
  if (input.quantity !== undefined) row.quantity = Math.max(0, Math.trunc(input.quantity));
  if (input.images !== undefined) row.images = input.images;
  if (input.diagram !== undefined) row.diagram = input.diagram;
  if (input.featured !== undefined) row.featured = input.featured;
  if (input.archived !== undefined) row.archived = input.archived;
  if (input.provenance !== undefined) row.provenance = input.provenance;
  return row;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

export function supabaseConfigured(): boolean {
  return env("NEXT_PUBLIC_SUPABASE_URL") !== null && env("SUPABASE_SERVICE_ROLE_KEY") !== null;
}

interface MessageRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  topic: string;
  body: string;
  handled: boolean;
  created_at: string;
}

const MESSAGE_COLUMNS = "id,name,email,phone,topic,body,handled,created_at";

/** The database stores `created_at`; the app type is camelCase, so the mapping is explicit. */
function toMessage(row: MessageRow): ContactMessage {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    topic: (MESSAGE_TOPICS.has(row.topic) ? row.topic : "general") as ContactMessage["topic"],
    body: row.body,
    handled: Boolean(row.handled),
    createdAt: String(row.created_at),
  };
}

const MESSAGE_TOPICS = new Set(["general", "sizing", "pickup", "press", "atelier"]);

export class SupabaseRepository implements CatalogRepository {
  readonly kind = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor() {
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    this.client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private fail(operation: string, error: { message: string } | null): never {
    throw new Error(`Supabase ${operation} failed: ${error?.message ?? "unknown error"}`);
  }

  async listProducts(): Promise<Product[]> {
    const { data, error } = await this.client.from("products").select(PRODUCT_COLUMNS).order("created_at", { ascending: false });
    if (error) this.fail("listProducts", error);
    return (data ?? []).map((row) => toProduct(row as ProductRow));
  }

  async findProductBySlug(slug: string): Promise<Product | null> {
    const { data, error } = await this.client.from("products").select(PRODUCT_COLUMNS).eq("slug", slug).maybeSingle();
    if (error) this.fail("findProductBySlug", error);
    return data ? toProduct(data as ProductRow) : null;
  }

  async findProductById(id: string): Promise<Product | null> {
    const { data, error } = await this.client.from("products").select(PRODUCT_COLUMNS).eq("id", id).maybeSingle();
    if (error) this.fail("findProductById", error);
    return data ? toProduct(data as ProductRow) : null;
  }

  async createProduct(input: NewProductInput): Promise<Product> {
    const { data, error } = await this.client
      .from("products")
      .insert({ ...toRow(input), slug: input.slug?.trim() || slugFrom(input.name) })
      .select(PRODUCT_COLUMNS)
      .single();
    if (error || !data) this.fail("createProduct", error);
    return toProduct(data as ProductRow);
  }

  async updateProduct(id: string, patch: ProductPatch): Promise<Product | null> {
    const row = toRow(patch);
    if (patch.slug !== undefined) row.slug = patch.slug?.trim() || row.slug;
    const { data, error } = await this.client.from("products").update(row).eq("id", id).select(PRODUCT_COLUMNS).maybeSingle();
    if (error) this.fail("updateProduct", error);
    return data ? toProduct(data as ProductRow) : null;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const { error, count } = await this.client.from("products").delete({ count: "exact" }).eq("id", id);
    if (error) this.fail("deleteProduct", error);
    return (count ?? 0) > 0;
  }

  async setQuantity(id: string, quantity: number): Promise<Product | null> {
    const { data, error } = await this.client
      .from("products")
      .update({ quantity: Math.max(0, Math.trunc(quantity)), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(PRODUCT_COLUMNS)
      .maybeSingle();
    if (error) this.fail("setQuantity", error);
    return data ? toProduct(data as ProductRow) : null;
  }

  async listOrders(): Promise<Order[]> {
    const { data, error } = await this.client.from("orders").select("*").order("created_at", { ascending: false });
    if (error) this.fail("listOrders", error);
    return (data ?? []).map(mapOrderRow);
  }

  async findOrderById(id: string): Promise<Order | null> {
    const { data, error } = await this.client.from("orders").select("*").or(`id.eq.${id},reference.eq.${id}`).maybeSingle();
    if (error) this.fail("findOrderById", error);
    return data ? mapOrderRow(data as Record<string, unknown>) : null;
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
    const { data, error } = await this.client
      .from("orders")
      .update({ status, updated_at: new Date().toISOString(), ...(status === "cancelled" ? { stock_released: true } : {}) })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) this.fail("updateOrderStatus", error);
    return data ? mapOrderRow(data as Record<string, unknown>) : null;
  }

  /**
   * One round trip, one database transaction. `place_order` re-reads each piece FOR UPDATE,
   * rejects the whole order if any quantity is short, prices from the stored column and
   * decrements stock - so overselling a one-of-one piece is prevented by the database, not by
   * application hope.
   */
  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const option = fulfilmentOptions().find((candidate) => candidate.id === input.fulfilment);
    if (!option) return { ok: false, error: { code: "invalid", message: "That delivery method is not available." } };
    const { data, error } = await this.client.rpc("place_order", {
      p_lines: input.lines.map((line) => ({ product_id: line.productId, quantity: Math.trunc(line.quantity) })),
      p_customer: input.customer,
      p_fulfilment: input.fulfilment,
      p_fulfilment_label: option.label,
      p_fulfilment_fee_cents: option.feeCents,
      p_payment_method: input.paymentMethod,
      p_idempotency_key: input.idempotencyKey ?? null,
    });
    if (error) {
      return { ok: false, error: { code: "unavailable", message: `The order could not be placed: ${message(error, "database error")}` } };
    }
    const result = data as PlaceOrderResult | null;
    if (!result || typeof result !== "object") return { ok: false, error: { code: "unavailable", message: "The order service returned no result." } };
    return result;
  }

  async listMessages(): Promise<ContactMessage[]> {
    const { data, error } = await this.client.from("contact_messages").select(MESSAGE_COLUMNS).order("created_at", { ascending: false });
    if (error) this.fail("listMessages", error);
    return (data ?? []).map((row) => toMessage(row as MessageRow));
  }

  async createMessage(input: Omit<ContactMessage, "id" | "createdAt" | "handled">): Promise<ContactMessage> {
    const { data, error } = await this.client
      .from("contact_messages")
      .insert({ name: input.name, email: input.email, phone: input.phone, topic: input.topic, body: input.body })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error || !data) this.fail("createMessage", error);
    return toMessage(data as MessageRow);
  }

  async markMessageHandled(id: string, handled: boolean): Promise<ContactMessage | null> {
    const { data, error } = await this.client
      .from("contact_messages")
      .update({ handled })
      .eq("id", id)
      .select(MESSAGE_COLUMNS)
      .maybeSingle();
    if (error) this.fail("markMessageHandled", error);
    return data ? toMessage(data as MessageRow) : null;
  }

  async getSiteContent(): Promise<SiteContent> {
    const { data, error } = await this.client.from("store_content").select("payload").eq("id", 1).maybeSingle();
    if (error) this.fail("getSiteContent", error);
    return { ...DEFAULT_SITE_CONTENT, ...((data?.payload as Partial<SiteContent> | undefined) ?? {}) };
  }

  async saveSiteContent(patch: Partial<SiteContent>): Promise<SiteContent> {
    const current = await this.getSiteContent();
    const next = { ...current, ...patch };
    const { error } = await this.client.from("store_content").upsert({ id: 1, payload: next });
    if (error) this.fail("saveSiteContent", error);
    return next;
  }
}

function mapOrderRow(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    reference: String(row.reference),
    status: row.status as OrderStatus,
    lines: (row.lines as Order["lines"]) ?? [],
    customer: row.customer as Order["customer"],
    fulfilment: row.fulfilment as Order["fulfilment"],
    fulfilmentLabel: String(row.fulfilment_label ?? ""),
    paymentMethod: row.payment_method as Order["paymentMethod"],
    subtotalCents: Number(row.subtotal_cents),
    deliveryCents: Number(row.delivery_cents),
    totalCents: Number(row.total_cents),
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function slugFrom(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base.length > 0 ? `${base}-${Date.now().toString(36).slice(-4)}` : `piece-${Date.now().toString(36)}`;
}
