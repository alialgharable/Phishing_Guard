import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The order endpoint is the only write path a customer has, so it is tested through the real handler
 * against the real file store: what it accepts, what it refuses, what it charges and what it does to
 * stock. Prices supplied by the "browser" are asserted to be ignored.
 */

const directory = mkdtempSync(path.join(tmpdir(), "vintage-magic-orders-"));
process.env.VINTAGE_LOCAL_DB = path.join(directory, "db.json");
process.env.VINTAGE_FORCE_LOCAL_DATA = "1";

const { POST } = await import("./route");
const { getRepository } = await import("@/lib/data");

const customer = { name: "Test Person", phone: "+961 3 555111", email: "test@example.com", addressLine: "", city: "", notes: "" };
let productId = "";

function jsonRequest(body: unknown): Request {
  return new Request("http://vintage.test/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const created = await getRepository().createProduct({
    name: "Route Test Blazer",
    era: "1960s",
    categories: ["jackets"],
    genders: ["unisex"],
    sizeLabel: "M",
    measurements: [],
    condition: "Sound.",
    description: null,
    priceCents: 24000,
    quantity: 1,
    images: [],
    featured: false,
    archived: false,
    provenance: null,
  });
  productId = created.id;
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("POST /api/orders", () => {
  it("rejects a body that is not JSON", async () => {
    const response = await POST(jsonRequest("this is not json"));
    expect(response.status).toBe(400);
  });

  it("refuses a fulfilment method the shop does not offer", async () => {
    const response = await POST(jsonRequest({ lines: [{ productId, quantity: 1 }], customer, fulfilment: "teleportation" }));
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.errors.fulfilment).toBeTruthy();
  });

  it("refuses a courier order with no address", async () => {
    const response = await POST(jsonRequest({ lines: [{ productId, quantity: 1 }], customer, fulfilment: "courier_beirut" }));
    expect(response.status).toBe(422);
    const payload = (await response.json()) as { errors: Record<string, string> };
    expect(payload.errors.addressLine).toBeTruthy();
    expect(payload.errors.city).toBeTruthy();
    // Refusing the order must not have touched stock.
    expect((await getRepository().findProductById(productId))?.quantity).toBe(1);
  });

  it("refuses an empty bag", async () => {
    const response = await POST(jsonRequest({ lines: [], customer, fulfilment: "pickup_beirut" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("empty_cart");
  });

  it("places the order with server prices, takes the piece out of the archive and points at the confirmation", async () => {
    const response = await POST(
      jsonRequest({
        lines: [{ productId, quantity: 1 }],
        // A browser-supplied price must be ignored, not trusted.
        customer: { ...customer, priceCents: 1, totalCents: 1 },
        fulfilment: "pickup_beirut",
        paymentMethod: "card",
        idempotencyKey: "route-test-1",
      }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { ok: boolean; order: { subtotalCents: number; totalCents: number; paymentMethod: string; id: string }; redirectTo: string };
    expect(payload.ok).toBe(true);
    expect(payload.order.subtotalCents).toBe(24000);
    expect(payload.order.totalCents).toBe(24000);
    expect(payload.order.paymentMethod).toBe("cash_on_collection");
    expect(payload.redirectTo).toBe(`/order/${payload.order.id}`);

    const product = await getRepository().findProductById(productId);
    expect(product?.quantity).toBe(0);
  });

  it("replays the same idempotency key instead of ordering twice", async () => {
    const first = await POST(jsonRequest({ lines: [{ productId, quantity: 1 }], customer, fulfilment: "pickup_beirut", idempotencyKey: "route-test-1" }));
    expect(first.status).toBe(201);
    const again = await POST(jsonRequest({ lines: [{ productId, quantity: 1 }], customer, fulfilment: "pickup_beirut", idempotencyKey: "route-test-1" }));
    expect(again.status).toBe(201);
    expect(((await again.json()) as { order: { id: string } }).order.id).toBe(((await first.json()) as { order: { id: string } }).order.id);
  });

  it("tells a second buyer the piece is gone, with what is left", async () => {
    const response = await POST(jsonRequest({ lines: [{ productId, quantity: 1 }], customer, fulfilment: "pickup_beirut", idempotencyKey: "route-test-2" }));
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { code: string; error: string; availableQuantity: number; productId: string };
    expect(payload.code).toBe("out_of_stock");
    expect(payload.availableQuantity).toBe(0);
    expect(payload.productId).toBe(productId);
    expect(payload.error).toMatch(/collected|left/i);
  });

  it("clamps a quantity the archive cannot supply rather than overselling", async () => {
    const restocked = await getRepository().setQuantity(productId, 2);
    expect(restocked?.quantity).toBe(2);
    const response = await POST(jsonRequest({ lines: [{ productId, quantity: 5 }], customer, fulfilment: "pickup_beirut", idempotencyKey: "route-test-3" }));
    expect(response.status).toBe(409);
    expect(((await response.json()) as { availableQuantity: number }).availableQuantity).toBe(2);
    expect((await getRepository().findProductById(productId))?.quantity).toBe(2);
  });
});
