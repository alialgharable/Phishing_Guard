import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, clearFailedAttempts, createSessionToken } from "@/lib/auth";
import {
  deleteProductAction,
  deleteProductFormAction,
  saveContentAction,
  saveProductAction,
  setMessageHandledAction,
  signInAction,
  signOutAction,
  updateOrderStatusAction,
  uploadImageAction,
  type ProductActionPayload,
} from "./actions";

/**
 * Admin authorisation, tested where it is enforced: in the server actions themselves.
 *
 * The panel being hidden in the browser proves nothing, so every write below is asserted twice - once
 * as an unauthenticated caller (the repository must never be reached) and once with a signed session
 * cookie. `next/headers` is mocked so the cookie jar is explicit, and `@/lib/data` is mocked so a
 * leaked authorisation check would show up as a call to a write method that must not happen.
 */

const store = vi.hoisted(() => {
  const cookies = new Map<string, string>();
  const repository = {
    listProducts: vi.fn(),
    findProductById: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    setQuantity: vi.fn(),
    updateOrderStatus: vi.fn(),
    saveSiteContent: vi.fn(),
    markMessageHandled: vi.fn(),
  };
  return {
    cookies,
    repository,
    writes: [] as Array<[string, string | undefined]>,
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (store.cookies.has(name) ? { name, value: store.cookies.get(name) } : undefined),
    set: (name: string, value: string) => {
      store.writes.push([name, value]);
      store.cookies.set(name, value);
    },
    delete: (name: string) => {
      store.writes.push([name, undefined]);
      store.cookies.delete(name);
    },
  })),
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/data", () => ({
  getRepository: () => store.repository,
  repositoryKind: () => "local",
}));

const PASSWORD = "correct horse battery staple";

function expectNoWrite(): void {
  for (const method of Object.keys(store.repository)) {
    expect(store.repository[method as keyof typeof store.repository], method).not.toHaveBeenCalled();
  }
}

async function signIn(): Promise<void> {
  const form = new FormData();
  form.set("password", PASSWORD);
  const outcome = await signInAction(form);
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
  expect(store.cookies.get(ADMIN_COOKIE)).toBeTruthy();
}

function productPayload(overrides: Partial<ProductActionPayload> = {}): ProductActionPayload {
  return {
    name: "Balcony Satin Blazer",
    slug: "balcony-satin-blazer",
    era: "1980s",
    categories: ["jackets"],
    genders: ["women"],
    sizeLabel: "S",
    price: "95",
    quantity: 1,
    condition: "Lined, one button replaced.",
    description: "Sharp shoulders, soft lining, photographed once.",
    provenance: "",
    diagram: "jacket",
    featured: false,
    archived: false,
    measurements: [{ label: "Chest", value: "92 cm" }],
    images: [],
    ...overrides,
  };
}

/** The throttle is keyed by client address, and the address below is fixed by the headers mock. */
const CLIENT_KEY = "login:203.0.113.7";

beforeEach(() => {
  clearFailedAttempts(CLIENT_KEY);
  // Call records are per test: a refusal asserted below has to mean "not called by this action".
  vi.clearAllMocks();
  store.cookies.clear();
  store.writes.length = 0;
  vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
  vi.stubEnv("ADMIN_SESSION_SECRET", "unit-test-secret-that-is-long-enough");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VINTAGE_FORCE_LOCAL_DATA", "1");
});

afterEach(() => {
  clearFailedAttempts(CLIENT_KEY);
  vi.unstubAllEnvs();
});

describe("signInAction", () => {
  it("issues a session cookie only for the configured password", async () => {
    const wrong = new FormData();
    wrong.set("password", "not the shop password");
    const attempt = await signInAction(wrong);
    expect(attempt.ok).toBe(false);
    expect(store.cookies.has(ADMIN_COOKIE)).toBe(false);

    await signIn();
    expect(store.cookies.get(ADMIN_COOKIE)).toMatch(/^\d+\./);
  });

  it("locks a client address that guesses six times inside the window", async () => {
    clearFailedAttempts(CLIENT_KEY);
    const attempts = [PASSWORD + "x", PASSWORD + "y", PASSWORD + "z", PASSWORD + "w", PASSWORD + "v"];
    for (const password of attempts) {
      const form = new FormData();
      form.set("password", password);
      expect((await signInAction(form)).ok).toBe(false);
    }
    const blocked = new FormData();
    blocked.set("password", PASSWORD);
    const outcome = await signInAction(blocked);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.error).toMatch(/Too many attempts/);
    // Even the right password is refused while the window is open; the store is untouched either way.
    expect(store.cookies.has(ADMIN_COOKIE)).toBe(false);
  });

  it("clears the cookie on sign out", async () => {
    await signIn();
    await expect(signOutAction()).rejects.toThrow("REDIRECT:/admin/login");
    expect(store.cookies.has(ADMIN_COOKIE)).toBe(false);
  });
});

describe("authorisation on every write path", () => {
  it("refuses all of them when the shop has no admin password configured", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    const content = new FormData();
    content.set("phone", "+961 1 000000");

    expect(await deleteProductAction("vm-0001")).toMatchObject({ ok: false });
    expect(await deleteProductFormAction(new FormData())).toMatchObject({ ok: false });
    expect(await saveContentAction(content)).toMatchObject({ ok: false });
    expect(await updateOrderStatusAction(new FormData())).toMatchObject({ ok: false });
    expect(await saveProductAction(productPayload())).toMatchObject({ ok: false });
    expect(await uploadImageAction(new FormData())).toMatchObject({ ok: false });
    expect(await setMessageHandledAction(new FormData())).toMatchObject({ ok: false });
    expectNoWrite();
  });

  it("refuses a forged or absent session cookie with a 401-shaped reason", async () => {
    store.cookies.set(ADMIN_COOKIE, "1799999999999.deadbeefdeadbeef");
    const outcome = await saveContentAction(new FormData());
    expect(outcome).toMatchObject({ ok: false });
    if (!outcome.ok) expect(outcome.error).toMatch(/session has ended/);
    expectNoWrite();
  });

  it("does not let a valid session outlive the secret that signed it", async () => {
    await signIn();
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-different-secret-entirely");
    // A token can still be minted under the new secret - which is exactly why the old one must fail.
    expect(createSessionToken()).toBeTruthy();
    const outcome = await saveContentAction(new FormData());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/session has ended/);
    expectNoWrite();
  });
});

describe("authenticated writes", () => {
  it("creates a product and refuses a slug another entry already owns", async () => {
    await signIn();
    store.repository.listProducts.mockResolvedValue([{ id: "vm-0009", slug: "other-piece", name: "Other" }]);
    store.repository.createProduct.mockResolvedValue({ id: "vm-0010", slug: "balcony-satin-blazer", name: "Balcony Satin Blazer" });

    const created = await saveProductAction(productPayload());
    expect(created).toEqual({ ok: true, id: "vm-0010", slug: "balcony-satin-blazer", isNew: true });
    expect(store.repository.createProduct).toHaveBeenCalledTimes(1);
    expect(store.repository.createProduct.mock.calls[0]![0]).toMatchObject({ priceCents: 9500, quantity: 1 });

    const clash = await saveProductAction(productPayload({ slug: "other-piece" }));
    expect(clash.ok).toBe(false);
    expect(clash.ok ? "" : clash.error).toMatch(/already used by another piece/);
    if (!clash.ok) expect(clash.errors?.slug).toMatch(/owns this slug/);
  });

  it("saves store content as the shop typed it, normalising what can be normalised", async () => {
    await signIn();
    store.repository.saveSiteContent.mockResolvedValue({});

    const form = new FormData();
    form.set("phone", "+961 1 234567");
    form.set("instagram", "https://www.instagram.com/vintagemagic/");
    form.set("aboutParagraphs", "First paragraph.\n\nSecond paragraph.");
    const outcome = await saveContentAction(form);
    expect(outcome.ok).toBe(true);

    const patch = store.repository.saveSiteContent.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch.phone).toBe("+961 1 234567");
    expect(patch.instagram).toBe("vintagemagic");
    expect(patch.email).toBeNull();
    expect(patch.aboutParagraphs).toEqual(["First paragraph.", "Second paragraph."]);
    // An unchecked checkbox is "off", never a silent "on".
    expect(patch.atelierTeaserEnabled).toBe(false);
  });

  it("refuses an unusable email instead of storing it", async () => {
    await signIn();
    const form = new FormData();
    form.set("email", "not-an-address");
    const outcome = await saveContentAction(form);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errors?.email).toMatch(/shop@example\.com/);
    expect(store.repository.saveSiteContent).not.toHaveBeenCalled();
  });

  it("moves an order only to a status the shop actually uses", async () => {
    await signIn();
    store.repository.updateOrderStatus.mockResolvedValue({ reference: "VM-2026-0042" });

    const invented = new FormData();
    invented.set("id", "order-1");
    invented.set("status", "teleported");
    expect(await updateOrderStatusAction(invented)).toMatchObject({ ok: false });
    expect(store.repository.updateOrderStatus).not.toHaveBeenCalled();

    const real = new FormData();
    real.set("id", "order-1");
    real.set("status", "collected");
    const outcome = await updateOrderStatusAction(real);
    expect(outcome).toMatchObject({ ok: true });
    expect(store.repository.updateOrderStatus).toHaveBeenCalledWith("order-1", "collected");
  });

  it("deletes through the form action, refusing a form that lost its id", async () => {
    await signIn();
    store.repository.deleteProduct.mockResolvedValue(true);

    const orphan = new FormData();
    expect(await deleteProductFormAction(orphan)).toMatchObject({ ok: false });
    expect(store.repository.deleteProduct).not.toHaveBeenCalled();

    const form = new FormData();
    form.set("id", "vm-0007");
    expect(await deleteProductFormAction(form)).toMatchObject({ ok: true });
    expect(store.repository.deleteProduct).toHaveBeenCalledWith("vm-0007");
  });

  it("does not accept an upload that is not a file", async () => {
    await signIn();
    const form = new FormData();
    form.set("file", "a string is not a file");
    expect(await uploadImageAction(form)).toMatchObject({ ok: false, error: /No file arrived/ });
  });
});
