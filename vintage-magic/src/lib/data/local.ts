import fs from "node:fs/promises";
import path from "node:path";
import { availabilityOf } from "../catalog";
import { fulfilmentOptions } from "../config";
import type { ContactMessage, Order, OrderStatus, Product, SiteContent } from "../types";
import { DEFAULT_SITE_CONTENT } from "../config";
import { SAMPLE_PRODUCTS } from "./sample-products";
import type { CatalogRepository, NewProductInput, PlaceOrderInput, PlaceOrderResult, ProductPatch } from "./repository";

/**
 * File-backed repository for local development and for this build's demo mode.
 *
 * It exists so the shop is genuinely functional without cloud credentials: reads, writes,
 * cart validation and stock decrement all really happen. Mutations are serialised through one
 * in-process queue and written via a temp file plus rename, so two checkouts cannot interleave
 * and a crash cannot leave half a JSON document behind. A multi-instance deployment must use
 * the Postgres adapter instead, where the same rule is enforced by row locks.
 */

interface DbDocument {
  version: 1;
  products: Product[];
  orders: Order[];
  messages: ContactMessage[];
  content: SiteContent;
}

/**
 * Path is deliberately resolved at call time and marked for Turbopack to ignore: this store is the
 * dev/demo backend, and without the hint the bundler traces the whole project (including `public/`)
 * into the server output because it cannot prove the path is scoped.
 */
const DB_PATH = process.env.VINTAGE_LOCAL_DB ?? path.join(process.cwd(), "data", "db.json");

let queue: Promise<unknown> = Promise.resolve();

function serialise<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function seedDocument(): DbDocument {
  return {
    version: 1,
    products: SAMPLE_PRODUCTS.map((product) => ({ ...product })),
    orders: [],
    messages: [],
    content: { ...DEFAULT_SITE_CONTENT },
  };
}

async function readDocument(): Promise<DbDocument> {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as DbDocument;
    if (!parsed || !Array.isArray(parsed.products)) throw new Error("unexpected shape");
    return {
      version: 1,
      products: parsed.products,
      orders: parsed.orders ?? [],
      messages: parsed.messages ?? [],
      content: { ...DEFAULT_SITE_CONTENT, ...(parsed.content ?? {}) },
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      const fresh = seedDocument();
      await writeDocument(fresh);
      return fresh;
    }
    // Never silently discard a store the shop can still read: keep the broken file beside us.
    const kept = `${DB_PATH}.unreadable-${Date.now()}`;
    await fs.rename(/* turbopackIgnore: true */ DB_PATH, /* turbopackIgnore: true */ kept).catch(() => undefined);
    const fresh = seedDocument();
    await writeDocument(fresh);
    return fresh;
  }
}

async function writeDocument(document: DbDocument): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const temp = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(/* turbopackIgnore: true */ temp, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await fs.rename(/* turbopackIgnore: true */ temp, /* turbopackIgnore: true */ DB_PATH);
}

function slugify(value: string, taken: Set<string>): string {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const safe = base.length > 0 ? base : `piece-${Date.now().toString(36)}`;
  if (!taken.has(safe)) return safe;
  let index = 2;
  while (taken.has(`${safe}-${index}`)) index += 1;
  return `${safe}-${index}`;
}

function buildReference(existing: Order[]): string {
  const year = new Date().getFullYear();
  const serial = 1000 + existing.length + 1;
  return `VM-${year}-${serial}`;
}

function applyPatch(product: Product, patch: ProductPatch, taken: Set<string>): Product {
  const next: Product = { ...product, updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.slug !== undefined) next.slug = patch.slug.trim().length > 0 ? patch.slug.trim() : slugify(patch.name ?? product.name, taken);
  if (patch.era !== undefined) next.era = patch.era;
  if (patch.categories !== undefined) next.categories = patch.categories;
  if (patch.genders !== undefined) next.genders = patch.genders;
  if (patch.sizeLabel !== undefined) next.sizeLabel = patch.sizeLabel;
  if (patch.measurements !== undefined) next.measurements = patch.measurements;
  if (patch.condition !== undefined) next.condition = patch.condition;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.priceCents !== undefined) next.priceCents = patch.priceCents;
  if (patch.quantity !== undefined) next.quantity = Math.max(0, Math.trunc(patch.quantity));
  if (patch.images !== undefined) next.images = patch.images;
  if (patch.diagram !== undefined) next.diagram = patch.diagram;
  if (patch.featured !== undefined) next.featured = patch.featured;
  if (patch.archived !== undefined) next.archived = patch.archived;
  if (patch.provenance !== undefined) next.provenance = patch.provenance;
  return next;
}

export class LocalRepository implements CatalogRepository {
  readonly kind = "local" as const;

  async listProducts(): Promise<Product[]> {
    return serialise(async () => {
      const document = await readDocument();
      return document.products.map((product) => ({ ...product }));
    });
  }

  async findProductBySlug(slug: string): Promise<Product | null> {
    return serialise(async () => {
      const document = await readDocument();
      const found = document.products.find((product) => product.slug === slug);
      return found ? { ...found } : null;
    });
  }

  async findProductById(id: string): Promise<Product | null> {
    return serialise(async () => {
      const document = await readDocument();
      const found = document.products.find((product) => product.id === id);
      return found ? { ...found } : null;
    });
  }

  async createProduct(input: NewProductInput): Promise<Product> {
    return serialise(async () => {
      const document = await readDocument();
      const taken = new Set(document.products.map((product) => product.slug));
      const now = new Date().toISOString();
      const product: Product = {
        id: newId("vm"),
        slug: input.slug && input.slug.trim().length > 0 ? input.slug.trim() : slugify(input.name, taken),
        name: input.name,
        era: input.era,
        categories: input.categories,
        genders: input.genders,
        sizeLabel: input.sizeLabel,
        measurements: input.measurements,
        condition: input.condition,
        description: input.description,
        priceCents: input.priceCents,
        quantity: Math.max(0, Math.trunc(input.quantity)),
        images: input.images,
        diagram: input.diagram ?? null,
        annotations: [],
        featured: input.featured,
        archived: input.archived,
        provenance: input.provenance,
        createdAt: now,
        updatedAt: now,
      };
      document.products.push(product);
      await writeDocument(document);
      return { ...product };
    });
  }

  async updateProduct(id: string, patch: ProductPatch): Promise<Product | null> {
    return serialise(async () => {
      const document = await readDocument();
      const index = document.products.findIndex((product) => product.id === id);
      if (index === -1) return null;
      const taken = new Set(document.products.filter((product) => product.id !== id).map((product) => product.slug));
      const updated = applyPatch(document.products[index]!, patch, taken);
      document.products[index] = updated;
      await writeDocument(document);
      return { ...updated };
    });
  }

  async deleteProduct(id: string): Promise<boolean> {
    return serialise(async () => {
      const document = await readDocument();
      const next = document.products.filter((product) => product.id !== id);
      if (next.length === document.products.length) return false;
      document.products = next;
      await writeDocument(document);
      return true;
    });
  }

  async setQuantity(id: string, quantity: number): Promise<Product | null> {
    return serialise(async () => {
      const document = await readDocument();
      const index = document.products.findIndex((product) => product.id === id);
      if (index === -1) return null;
      const next = { ...document.products[index]!, quantity: Math.max(0, Math.trunc(quantity)), updatedAt: new Date().toISOString() };
      document.products[index] = next;
      await writeDocument(document);
      return { ...next };
    });
  }

  async listOrders(): Promise<Order[]> {
    return serialise(async () => {
      const document = await readDocument();
      return [...document.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((order) => ({ ...order }));
    });
  }

  async findOrderById(id: string): Promise<Order | null> {
    return serialise(async () => {
      const document = await readDocument();
      const found = document.orders.find((order) => order.id === id || order.reference === id);
      return found ? { ...found } : null;
    });
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
    return serialise(async () => {
      const document = await readDocument();
      const index = document.orders.findIndex((order) => order.id === id);
      if (index === -1) return null;
      const order = document.orders[index]!;
      const next: Order = { ...order, status, updatedAt: new Date().toISOString() };
      // Releasing an order puts the pieces back in the archive; collecting one finalises it.
      if (status === "cancelled" && order.status !== "cancelled") {
        for (const line of order.lines) {
          const productIndex = document.products.findIndex((product) => product.id === line.productId);
          if (productIndex !== -1) {
            document.products[productIndex] = {
              ...document.products[productIndex]!,
              quantity: document.products[productIndex]!.quantity + line.quantity,
              updatedAt: new Date().toISOString(),
            };
          }
        }
      }
      document.orders[index] = next;
      await writeDocument(document);
      return { ...next };
    });
  }

  /**
   * The whole checkout runs inside one serialised critical section: stock is re-read from the
   * store, validated, priced from the stored price (never from the request), decremented and
   * persisted before the lock is released. Two shoppers cannot both take the last one-of-one.
   */
  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    return serialise(async () => {
      const document = await readDocument();

      const lines = (input.lines ?? []).map((line) => ({ productId: line.productId, quantity: Math.trunc(line.quantity) })).filter((line) => line.quantity > 0);
      if (lines.length === 0) return { ok: false, error: { code: "empty_cart", message: "The bag is empty." } };

      const merged = new Map<string, number>();
      for (const line of lines) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);

      const idempotencyKey = input.idempotencyKey?.trim() || null;
      if (idempotencyKey) {
        const repeat = document.orders.find((order) => order.idempotencyKey === idempotencyKey);
        if (repeat) return { ok: true, order: { ...repeat } };
      }

      const options = fulfilmentOptions();
      const option = options.find((candidate) => candidate.id === input.fulfilment);
      if (!option) return { ok: false, error: { code: "invalid", message: "That delivery method is not available." } };

      const orderLines: Order["lines"] = [];
      let subtotalCents = 0;

      for (const [productId, requested] of merged) {
        const index = document.products.findIndex((product) => product.id === productId);
        if (index === -1) return { ok: false, error: { code: "unavailable", message: "A piece in the bag is no longer in the archive.", productId } };
        const product = document.products[index]!;
        if (product.archived) {
          return { ok: false, error: { code: "unavailable", message: `“${product.name}” has left the archive.`, productId } };
        }
        // How many the archive can supply at all - `purchasableQuantity` would cap that at the
        // request being validated, which is not what an availability check means.
        const allowed = availabilityOf(product).quantity;
        if (allowed < requested) {
          return {
            ok: false,
            error: {
              code: "out_of_stock",
              message:
                availabilityOf(product).collected
                  ? `“${product.name}” has already been collected.`
                  : `Only ${allowed} of “${product.name}” ${allowed === 1 ? "is" : "are"} left.`,
              productId,
              availableQuantity: allowed,
            },
          };
        }
        orderLines.push({
          productId: product.id,
          slug: product.slug,
          name: product.name,
          sizeLabel: product.sizeLabel,
          unitPriceCents: product.priceCents,
          quantity: requested,
          imageSrc: product.images[0]?.src ?? null,
        });
        subtotalCents += product.priceCents * requested;
        document.products[index] = { ...product, quantity: product.quantity - requested, updatedAt: new Date().toISOString() };
      }

      const now = new Date().toISOString();
      const order: Order = {
        id: newId("order"),
        reference: buildReference(document.orders),
        status: "placed",
        lines: orderLines,
        customer: input.customer,
        fulfilment: option.id,
        fulfilmentLabel: option.label,
        paymentMethod: input.paymentMethod,
        subtotalCents,
        deliveryCents: option.feeCents,
        totalCents: subtotalCents + option.feeCents,
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
      };
      document.orders.push(order);
      await writeDocument(document);
      return { ok: true, order: { ...order } };
    });
  }

  async listMessages(): Promise<ContactMessage[]> {
    return serialise(async () => {
      const document = await readDocument();
      return [...document.messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  async createMessage(input: Omit<ContactMessage, "id" | "createdAt" | "handled">): Promise<ContactMessage> {
    return serialise(async () => {
      const document = await readDocument();
      const message: ContactMessage = { ...input, id: newId("msg"), createdAt: new Date().toISOString(), handled: false };
      document.messages.push(message);
      await writeDocument(document);
      return { ...message };
    });
  }

  async markMessageHandled(id: string, handled: boolean): Promise<ContactMessage | null> {
    return serialise(async () => {
      const document = await readDocument();
      const index = document.messages.findIndex((message) => message.id === id);
      if (index === -1) return null;
      document.messages[index] = { ...document.messages[index]!, handled };
      await writeDocument(document);
      return { ...document.messages[index]! };
    });
  }

  async getSiteContent(): Promise<SiteContent> {
    return serialise(async () => {
      const document = await readDocument();
      return { ...document.content };
    });
  }

  async saveSiteContent(patch: Partial<SiteContent>): Promise<SiteContent> {
    return serialise(async () => {
      const document = await readDocument();
      document.content = { ...document.content, ...patch };
      await writeDocument(document);
      return { ...document.content };
    });
  }
}
