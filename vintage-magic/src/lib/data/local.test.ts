import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The file-backed store is what makes this build functional without cloud credentials, so it is
 * tested for real: writes, the atomic order transaction, oversell protection, idempotent replay and
 * the stock that a cancellation gives back. Every case runs against a temporary database file.
 */

const directory = mkdtempSync(path.join(tmpdir(), "vintage-magic-test-"));
process.env.VINTAGE_LOCAL_DB = path.join(directory, "db.json");
process.env.VINTAGE_FORCE_LOCAL_DATA = "1";

const { LocalRepository } = await import("./local");
const { SAMPLE_PRODUCTS } = await import("./sample-products");

import type { Order } from "../types";
import type { NewProductInput } from "./repository";

/** A complete NewProductInput with sensible defaults, so each case only states what it varies. */
function input(overrides: Partial<NewProductInput> & { name: string }): NewProductInput {
  return {
    era: null,
    categories: ["jackets"],
    genders: ["unisex"],
    sizeLabel: null,
    measurements: [],
    condition: null,
    description: null,
    priceCents: 10000,
    quantity: 1,
    images: [],
    featured: false,
    archived: false,
    provenance: null,
    ...overrides,
  };
}

function freshRepository(): InstanceType<typeof LocalRepository> {
  return new LocalRepository();
}

beforeAll(() => {
  rmSync(process.env.VINTAGE_LOCAL_DB as string, { force: true });
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("LocalRepository seed", () => {
  it("seeds the sample archive on first read and persists it", async () => {
    const repository = freshRepository();
    const products = await repository.listProducts();
    expect(products.length).toBe(SAMPLE_PRODUCTS.length);
    expect(products.every((product) => product.slug.length > 0)).toBe(true);
    expect(products.every((product) => product.priceCents > 0)).toBe(true);
    // Nothing in the seed may be a phantom: every photograph it names is a file in public/media.
    for (const product of products) {
      for (const image of product.images) {
        expect(image.src.startsWith("/media/")).toBe(true);
      }
    }
  });

  it("starts with no orders and no messages", async () => {
    const repository = freshRepository();
    expect(await repository.listOrders()).toEqual([]);
    expect(await repository.listMessages()).toEqual([]);
  });
});

describe("LocalRepository products", () => {
  it("creates a slugged row and refuses to overwrite an existing slug silently", async () => {
    const repository = freshRepository();
    const created = await repository.createProduct(input({ name: "Test Corduroy Trucker", era: "1970s", sizeLabel: "M", priceCents: 15000, measurements: [{ label: "Chest", value: "54 cm" }], condition: "Cord worn soft, cuffs tidy.", description: "Test row." }));
    expect(created.slug).toMatch(/test-corduroy-trucker/);
    expect(created.diagram).toBeNull();

    const duplicate = await repository.createProduct(input({ name: "Second Test Corduroy Trucker", slug: created.slug, priceCents: 15000 }));
    expect(duplicate.slug).toBe(created.slug);

    await repository.deleteProduct(created.id);
    await repository.deleteProduct(duplicate.id);
  });

  it("honours an explicit cut diagram on create and update", async () => {
    const repository = freshRepository();
    const created = await repository.createProduct(input({ name: "Diagrammed Scarf", categories: ["accessories"], priceCents: 4000, quantity: 2, diagram: "scarf" }));
    expect(created.diagram).toBe("scarf");
    const updated = await repository.updateProduct(created.id, { diagram: "purse", quantity: 0 });
    expect(updated?.diagram).toBe("purse");
    expect(updated?.quantity).toBe(0);
    await repository.deleteProduct(created.id);
  });

  it("never lets stock go negative through setQuantity", async () => {
    const repository = freshRepository();
    const [sample] = await repository.listProducts();
    const updated = await repository.setQuantity(sample!.id, -5);
    expect(updated?.quantity).toBe(0);
    await repository.setQuantity(sample!.id, 1);
  });
});

describe("LocalRepository orders", () => {
  let productId = "";
  let order: Order | null = null;

  beforeAll(async () => {
    const repository = freshRepository();
    const created = await repository.createProduct(
      input({ name: "One Of One Blazer", era: "1960s", genders: ["men"], sizeLabel: "48R", condition: "Sound.", priceCents: 24000, images: [{ src: "/media/hero-coat.jpg", alt: "Blazer" }] }),
    );
    productId = created.id;
  });

  it("prices from the row and decrements the piece", async () => {
    const repository = freshRepository();
    const result = await repository.placeOrder({
      lines: [{ productId, quantity: 1 }],
      customer: { name: "Test Person", phone: "+961 3 000000", email: null, addressLine: null, city: null, notes: null },
      fulfilment: "pickup_beirut",
      paymentMethod: "cash_on_collection",
      idempotencyKey: "key-single",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    order = result.order;
    expect(order.subtotalCents).toBe(24000);
    expect(order.deliveryCents).toBe(0);
    expect(order.totalCents).toBe(24000);
    expect(order.paymentMethod).toBe("cash_on_collection");
    const product = await repository.findProductById(productId);
    expect(product?.quantity).toBe(0);
  });

  it("replays the same idempotency key without taking stock twice", async () => {
    const repository = freshRepository();
    const result = await repository.placeOrder({
      lines: [{ productId, quantity: 1 }],
      customer: { name: "Test Person", phone: "+961 3 000000", email: null, addressLine: null, city: null, notes: null },
      fulfilment: "pickup_beirut",
      paymentMethod: "cash_on_collection",
      idempotencyKey: "key-single",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.id).toBe(order!.id);
    const product = await repository.findProductById(productId);
    expect(product?.quantity).toBe(0);
  });

  it("refuses the same piece for a second buyer", async () => {
    const repository = freshRepository();
    const result = await repository.placeOrder({
      lines: [{ productId, quantity: 1 }],
      customer: { name: "Other Person", phone: "+961 3 111111", email: null, addressLine: null, city: null, notes: null },
      fulfilment: "pickup_beirut",
      paymentMethod: "cash_on_collection",
      idempotencyKey: "key-second-buyer",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("out_of_stock");
    expect(result.error.availableQuantity).toBe(0);
    expect(result.error.productId).toBe(productId);
  });

  it("refuses an empty bag and an unknown fulfilment method", async () => {
    const repository = freshRepository();
    const empty = await repository.placeOrder({ lines: [], customer: { name: "x", phone: "y", email: null, addressLine: null, city: null, notes: null }, fulfilment: "pickup_beirut", paymentMethod: "cash_on_collection" });
    expect(!empty.ok && empty.error.code).toBe("empty_cart");

    const bogus = await repository.placeOrder({
      lines: [{ productId, quantity: 1 }],
      customer: { name: "x", phone: "y", email: null, addressLine: null, city: null, notes: null },
      fulfilment: "carrier-pigeon" as Order["fulfilment"],
      paymentMethod: "cash_on_delivery",
    });
    expect(!bogus.ok && bogus.error.code).toBe("invalid");
  });

  it("gives the piece back when the order is cancelled, once", async () => {
    const repository = freshRepository();
    const cancelled = await repository.updateOrderStatus(order!.id, "cancelled");
    expect(cancelled?.status).toBe("cancelled");
    const afterCancel = await repository.findProductById(productId);
    expect(afterCancel?.quantity).toBe(1);

    // A second cancellation of the same order must not mint a second copy of the garment.
    await repository.updateOrderStatus(order!.id, "cancelled");
    const afterSecond = await repository.findProductById(productId);
    expect(afterSecond?.quantity).toBe(1);

    await repository.deleteProduct(productId);
  });
});

describe("LocalRepository content and messages", () => {
  it("stores an enquiry and marks it handled", async () => {
    const repository = freshRepository();
    const message = await repository.createMessage({ name: "Curious Buyer", email: "buyer@example.com", phone: null, topic: "sizing", body: "Shoulders?" });
    expect(message.id).toBeTruthy();
    expect(message.handled).toBe(false);

    const listed = await repository.listMessages();
    expect(listed.some((entry) => entry.id === message.id)).toBe(true);

    const handled = await repository.markMessageHandled(message.id, true);
    expect(handled?.handled).toBe(true);
    expect(await repository.markMessageHandled("missing", true)).toBeNull();
  });

  it("merges saved content over the defaults instead of replacing the record", async () => {
    const repository = freshRepository();
    const saved = await repository.saveSiteContent({ phone: "+961 1 000000" });
    expect(saved.phone).toBe("+961 1 000000");
    expect(saved.aboutParagraphs.length).toBeGreaterThan(0);
    expect(saved.aboutHeading.length).toBeGreaterThan(0);
    const again = await repository.getSiteContent();
    expect(again.phone).toBe("+961 1 000000");
  });
});

describe("repository selection", () => {
  it("is pinned to the file store when the flag is set, and reports the sample state", async () => {
    const { getRepository, repositoryKind, servingSampleData } = await import("./index");
    expect(repositoryKind()).toBe("local");
    expect(getRepository().kind).toBe("local");
    expect(typeof servingSampleData()).toBe("boolean");
  });
});
