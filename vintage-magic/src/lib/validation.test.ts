import { describe, expect, it } from "vitest";
import {
  booleanParam,
  diagramIdFor,
  isImageSrc,
  optionalText,
  pickFrom,
  pickOptionalEnum,
  priceCapFrom,
  requiredText,
  sanitizeMultiline,
  sanitizeText,
  validateCheckout,
  validateContact,
  validateEmail,
  validatePhone,
  validateProductDraft,
} from "./validation";
import { CATEGORIES, GENDERS } from "./types";

/**
 * One set of rules used by the browser forms, the API routes and the admin actions. They live in a
 * single module so a rule cannot be right in one place and wrong in another - and every one of them
 * is enforced again on the server.
 */

describe("text hygiene", () => {
  it("strips control characters, collapses whitespace and caps length", () => {
    expect(sanitizeText("  a\u0000b\u001fc  ", 10)).toBe("abc");
    expect(sanitizeText("x".repeat(500), 10).length).toBe(10);
    expect(sanitizeText(null, 10)).toBe("");
    expect(sanitizeText(42, 10)).toBe("");
  });

  it("keeps line breaks in multiline fields", () => {
    expect(sanitizeMultiline("one\r\ntwo", 100)).toBe("one\ntwo");
    expect(sanitizeMultiline("  padded  \n  lines ", 100)).toBe("padded\nlines");
    expect(sanitizeMultiline(undefined, 100)).toBe("");
  });

  it("treats a two-character name as present and a single character as missing", () => {
    expect(requiredText("Al", "Name").error).toBeUndefined();
    expect(requiredText("A", "Name").error).toBe("Name is required.");
    expect(requiredText("", "Name").error).toBe("Name is required.");
    expect(optionalText("   ", 20)).toBeNull();
    expect(optionalText("  kept  ", 20)).toBe("kept");
  });
});

describe("contact details", () => {
  it("accepts a normal address and lower-cases it", () => {
    expect(validateEmail(" Buyer@Example.COM ")).toEqual({ value: "buyer@example.com", error: undefined });
  });

  it("is optional until the caller says otherwise", () => {
    expect(validateEmail("")).toEqual({ value: null, error: undefined });
    expect(validateEmail("", { required: true }).error).toBe("Email is required.");
  });

  it("rejects look-alikes instead of storing junk", () => {
    expect(validateEmail("nope").error).toBeTruthy();
    expect(validateEmail("two @spaces.test").error).toBeTruthy();
    expect(validateEmail("missing@tld").error).toBeTruthy();
  });

  it("accepts the number shapes people actually write and rejects words", () => {
    expect(validatePhone("+961 3 555 111").value).toBe("+961 3 555 111");
    expect(validatePhone("(01) 234 567").value).toBe("(01) 234 567");
    expect(validatePhone("call me").error).toBeTruthy();
    expect(validatePhone("12345").error).toBeTruthy();
    expect(validatePhone("1".repeat(20)).error).toBeTruthy();
    expect(validatePhone("", { required: false })).toEqual({ value: null, error: undefined });
    expect(validatePhone("").error).toMatch(/phone number is needed/i);
  });
});

describe("validateCheckout", () => {
  const base = { name: "Test Person", phone: "+961 3 555111", email: "", addressLine: "", city: "", notes: "" };

  it("requires a name and a phone, and nothing else", () => {
    const result = validateCheckout(base, { requiresAddress: false });
    expect(result.errors).toEqual({});
    expect(result.value.name).toBe("Test Person");
    expect(result.value.email).toBeNull();
    expect(result.value.notes).toBeNull();
  });

  it("refuses to accept a courier order without somewhere to deliver to", () => {
    const missing = validateCheckout(base, { requiresAddress: true });
    expect(Object.keys(missing.errors).sort()).toEqual(["addressLine", "city"]);

    const filled = validateCheckout({ ...base, addressLine: "Hamra street, building 12, apartment 4", city: "Beirut" }, { requiresAddress: true });
    expect(filled.errors).toEqual({});
    expect(filled.value.addressLine).toBe("Hamra street, building 12, apartment 4");
  });

  it("truncates a note rather than rejecting the order over it", () => {
    const result = validateCheckout({ ...base, notes: "n".repeat(900) }, { requiresAddress: false });
    expect(result.errors).toEqual({});
    expect((result.value.notes ?? "").length).toBeLessThanOrEqual(500);
  });

  it("keeps malformed emails out while still accepting the order details", () => {
    const result = validateCheckout({ ...base, email: "not-an-email" }, { requiresAddress: false });
    expect(result.errors.email).toBeTruthy();
  });
});

describe("validateContact", () => {
  it("needs one route back to the visitor", () => {
    const result = validateContact({ name: "Curious", email: "", phone: "", topic: "general", body: "Is the shoulder 44 cm on this jacket?" });
    expect(result.errors.email).toMatch(/email or a phone/i);
  });

  it("accepts a phone only, and keeps an unknown topic as general", () => {
    const result = validateContact({ name: "Curious", email: "", phone: "+961 3 000000", topic: "chaos", body: "Second-hand coats, still available?" });
    expect(result.errors).toEqual({});
    expect(result.value.topic).toBe("general");
    expect(result.value.phone).toBe("+961 3 000000");
  });

  it("refuses a message too short to act on", () => {
    expect(validateContact({ name: "A", email: "a@example.com", topic: "general", body: "hi" }).errors.body).toBeTruthy();
  });
});

describe("validateProductDraft", () => {
  const base = { name: "Corduroy Trucker", price: "120", quantity: "1", categories: ["jackets"], genders: ["unisex"] };

  it("turns a typed price into cents and defaults the optional fields", () => {
    const { value, errors } = validateProductDraft(base);
    expect(errors).toEqual({});
    expect(value?.priceCents).toBe(12000);
    expect(value?.quantity).toBe(1);
    expect(value?.slug).toBeNull();
    expect(value?.diagram).toBeNull();
    expect(value?.images).toEqual([]);
    expect(value?.featured).toBe(false);
  });

  it("refuses prices that are not money, zero, or absurd", () => {
    expect(validateProductDraft({ ...base, price: "" }).errors.price).toBeTruthy();
    expect(validateProductDraft({ ...base, price: "0" }).errors.price).toBeTruthy();
    expect(validateProductDraft({ ...base, price: "-12" }).errors.price).toBeTruthy();
    expect(validateProductDraft({ ...base, price: "1000000" }).errors.price).toBeTruthy();
  });

  it("keeps stock a whole number between 0 and 999", () => {
    expect(validateProductDraft({ ...base, quantity: "three" }).errors.quantity).toBeTruthy();
    expect(validateProductDraft({ ...base, quantity: "-1" }).errors.quantity).toBeTruthy();
    expect(validateProductDraft({ ...base, quantity: "1000" }).errors.quantity).toBeTruthy();
    expect(validateProductDraft({ ...base, quantity: "0" }).value?.quantity).toBe(0);
  });

  it("requires a real category and falls back to unisex", () => {
    expect(validateProductDraft({ ...base, categories: ["hats"] }).errors.categories).toBeTruthy();
    expect(validateProductDraft({ ...base, categories: "shirts" }).value?.categories).toEqual(["shirts"]);
    expect(validateProductDraft({ ...base, genders: ["nonbinary"] }).value?.genders).toEqual(["unisex"]);
  });

  it("normalises a slug and rejects one that cannot identify anything", () => {
    expect(validateProductDraft({ ...base, slug: "  My   Jacket!!  " }).value?.slug).toBe("my-jacket");
    expect(validateProductDraft({ ...base, slug: "ab" }).errors.slug).toBeTruthy();
  });

  it("reads measurements from a plain text block", () => {
    const value = validateProductDraft({ ...base, measurements: "Chest: 52\nSleeve = 61\nthis line is not a measurement" }).value;
    expect(value?.measurements).toEqual([
      { label: "Chest", value: "52" },
      { label: "Sleeve", value: "61" },
    ]);
  });

  it("accepts structured measurement rows too", () => {
    const value = validateProductDraft({ ...base, measurements: [{ label: " Length ", value: " 70 cm " }, { label: "", value: "x" }] }).value;
    expect(value?.measurements).toEqual([{ label: "Length", value: "70 cm" }]);
  });

  it("keeps only images the site can actually serve", () => {
    const value = validateProductDraft({
      ...base,
      images: [
        "/media/hero-coat.jpg",
        { src: "https://bucket.supabase.co/storage/v1/object/public/images/a.png", alt: "Coat" },
        { src: "javascript:alert(1)", alt: "attack" },
        { src: "../secrets/db.json", alt: "no" },
        { src: "  ", alt: "empty" },
      ],
    }).value;
    expect(value?.images).toEqual([
      { src: "/media/hero-coat.jpg", alt: "" },
      { src: "https://bucket.supabase.co/storage/v1/object/public/images/a.png", alt: "Coat" },
    ]);
  });

  it("reads the flag checkboxes in every shape a form sends them", () => {
    expect(validateProductDraft({ ...base, featured: "on", archived: true }).value).toMatchObject({ featured: true, archived: true });
    expect(validateProductDraft({ ...base, featured: "false" }).value?.featured).toBe(false);
  });

  it("maps an unknown diagram to none rather than guessing a shape", () => {
    expect(validateProductDraft({ ...base, diagram: "purse" }).value?.diagram).toBe("purse");
    expect(validateProductDraft({ ...base, diagram: "handbag" }).value?.diagram).toBeNull();
  });
});

describe("query guards", () => {
  it("tolerates junk in a URL instead of throwing on it", () => {
    expect(pickFrom("SHIRTS", CATEGORIES, "all")).toBe("shirts");
    expect(pickFrom("hats", CATEGORIES, "all")).toBe("all");
    expect(pickOptionalEnum("women", GENDERS)).toBe("women");
    expect(pickOptionalEnum("everything", GENDERS)).toBe("all");
    expect(pickOptionalEnum(undefined, GENDERS)).toBe("all");
    expect(priceCapFrom("40")).toBe(4000);
    expect(priceCapFrom("0")).toBeNull();
    expect(priceCapFrom("-3")).toBeNull();
    expect(priceCapFrom(undefined)).toBeNull();
    expect(booleanParam("on")).toBe(true);
    expect(booleanParam("1")).toBe(true);
    expect(booleanParam("false")).toBe(false);
    expect(booleanParam(undefined)).toBe(false);
    expect(diagramIdFor("COAT")).toBe("coat");
    expect(diagramIdFor(null)).toBeNull();
  });

  it("accepts site paths and absolute http URLs for images, and nothing else", () => {
    expect(isImageSrc("/media/hero-coat.jpg")).toBe(true);
    expect(isImageSrc("https://cdn.example.test/a.webp")).toBe(true);
    expect(isImageSrc("//cdn.example.test/a.webp")).toBe(false);
    expect(isImageSrc("/media/../secrets")).toBe(false);
    expect(isImageSrc("media/a.jpg")).toBe(false);
    expect(isImageSrc("javascript:alert(1)")).toBe(false);
    expect(isImageSrc("https://a.test/x y.png")).toBe(false);
  });
});
