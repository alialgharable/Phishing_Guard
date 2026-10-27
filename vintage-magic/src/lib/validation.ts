import { parseUsdToCents, MAX_PRICE_CENTS } from "./money";
import type { CategoryId, DiagramId, GenderId, Product, ProductImage } from "./types";
import { CATEGORIES, GENDERS } from "./types";

/**
 * Input validation used by both the browser and the server. Every rule is enforced again on the
 * server - these functions exist so the same message appears in both places, not so the client
 * can be trusted.
 */

export type FieldErrors = Record<string, string>;

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function sanitizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Multi-line fields keep their line breaks but lose control characters and trailing space. */
export function sanitizeMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim()
    .slice(0, max);
}

export function requiredText(value: unknown, field: string, max = 120): { value: string; error?: string } {
  const clean = sanitizeText(value, max);
  if (clean.length < 2) return { value: clean, error: `${field} is required.` };
  return { value: clean };
}

export function optionalText(value: unknown, max = 240): string | null {
  const clean = sanitizeText(value, max);
  return clean.length > 0 ? clean : null;
}

export function validateEmail(value: unknown, { required = false }: { required?: boolean } = {}): { value: string | null; error?: string } {
  const clean = sanitizeText(value, 160).toLowerCase();
  if (clean.length === 0) return required ? { value: null, error: "Email is required." } : { value: null };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(clean)) return { value: null, error: "That email address does not look complete." };
  return { value: clean };
}

/**
 * Lebanese numbers vary by carrier and landline format, so the rule is deliberately loose: enough
 * digits to be plausible, and nothing that would break a URL or a form field.
 */
export function validatePhone(value: unknown, { required = true }: { required?: boolean } = {}): { value: string | null; error?: string } {
  const raw = sanitizeText(value, 40);
  if (raw.length === 0) return required ? { value: null, error: "A phone number is needed to arrange delivery or collection." } : { value: null };
  if (!/^[+\d(][\d\s().-]*$/.test(raw)) return { value: null, error: "Digits, spaces, brackets and + only." };
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return { value: null, error: "That number is too short to reach anyone." };
  if (digits.length > 15) return { value: null, error: "That number is too long." };
  return { value: raw };
}

export interface CheckoutDraft {
  name: string;
  phone: string;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
}

export function validateCheckout(input: Record<string, unknown>, options: { requiresAddress: boolean }): { value: CheckoutDraft; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = requiredText(input.name, "Name", 80);
  if (name.error) errors.name = name.error;
  const phone = validatePhone(input.phone, { required: true });
  if (phone.error) errors.phone = phone.error;
  const email = validateEmail(input.email, { required: false });
  if (email.error) errors.email = email.error;

  const address = optionalText(input.addressLine, 200);
  const city = optionalText(input.city, 80);
  if (options.requiresAddress && (address ?? "").length < 8) {
    errors.addressLine = "A street, building and district are needed for the courier.";
  }
  if (options.requiresAddress && city === null) {
    errors.city = "A city is needed for the courier.";
  }
  const notesRaw = input.notes;
  const notes = typeof notesRaw === "string" ? sanitizeMultiline(notesRaw, 500) : null;

  return {
    value: {
      name: name.value,
      phone: phone.value ?? "",
      email: email.value,
      addressLine: address,
      city,
      notes: notes && notes.length > 0 ? notes : null,
    },
    errors,
  };
}

export function validateContact(input: Record<string, unknown>): {
  value: { name: string; email: string | null; phone: string | null; topic: string; body: string };
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const name = requiredText(input.name, "Name", 80);
  if (name.error) errors.name = name.error;

  const email = validateEmail(input.email);
  const phone = validatePhone(input.phone, { required: false });
  if (email.error) errors.email = email.error;
  if (phone.error) errors.phone = phone.error;
  if (email.value === null && phone.value === null) {
    errors.email = "Give an email or a phone number so the reply can reach you.";
  }

  const topicRaw = sanitizeText(input.topic, 24).toLowerCase();
  const topics = ["general", "sizing", "pickup", "press", "atelier"] as const;
  const topic = (topics as readonly string[]).includes(topicRaw) ? topicRaw : "general";

  const body = sanitizeMultiline(input.body, 2000);
  if (body.length < 12) errors.body = "A sentence or two more, please.";

  return { value: { name: name.value, email: email.value, phone: phone.value, topic, body }, errors };
}

export interface ProductDraft {
  name: string;
  slug: string | null;
  era: string | null;
  categories: CategoryId[];
  genders: GenderId[];
  sizeLabel: string | null;
  measurements: Array<{ label: string; value: string }>;
  condition: string | null;
  description: string | null;
  priceCents: number;
  quantity: number;
  images: ProductImage[];
  diagram: DiagramId | null;
  featured: boolean;
  archived: boolean;
  provenance: string | null;
}

/** Admin product form. Prices are parsed into cents here and re-validated in the route handler. */
export function validateProductDraft(input: Record<string, unknown>): { value?: ProductDraft; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = requiredText(input.name, "Name", 120);
  if (name.error) errors.name = name.error;

  const price = parseUsdToCents(typeof input.price === "string" ? input.price : (input.priceCents as number | undefined));
  if (price === null || price <= 0) errors.price = "Enter a price in USD, for example 120 or 120.50.";
  else if (price > MAX_PRICE_CENTS) errors.price = "That price is too large to be a garment.";

  const quantityRaw = typeof input.quantity === "string" ? Number.parseInt(input.quantity, 10) : Number(input.quantity);
  if (!Number.isFinite(quantityRaw) || quantityRaw < 0 || quantityRaw > 999) errors.quantity = "Stock must be a whole number between 0 and 999.";

  const categoriesRaw = Array.isArray(input.categories) ? input.categories : typeof input.categories === "string" ? [input.categories] : [];
  const categories = categoriesRaw.map((value) => sanitizeText(value, 24).toLowerCase()).filter((value): value is CategoryId => (CATEGORIES as readonly string[]).includes(value));
  if (categories.length === 0) errors.categories = "Pick at least one category.";

  const gendersRaw = Array.isArray(input.genders) ? input.genders : typeof input.genders === "string" ? [input.genders] : ["unisex"];
  const genders = gendersRaw.map((value) => sanitizeText(value, 16).toLowerCase()).filter((value): value is GenderId => (GENDERS as readonly string[]).includes(value));

  const slug = optionalText(input.slug, 120)?.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") ?? null;
  if (slug !== null && slug.length > 0 && slug.length < 3) errors.slug = "A slug needs at least three characters.";

  const measurements = parseMeasurements(input.measurements);
  const images = parseImages(input.images);

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    value: {
      name: name.value,
      slug: slug && slug.length > 0 ? slug : null,
      era: optionalText(input.era, 24),
      categories,
      genders: genders.length > 0 ? genders : ["unisex"],
      sizeLabel: optionalText(input.sizeLabel, 24),
      measurements,
      condition: optionalText(input.condition, 400),
      description: typeof input.description === "string" ? (sanitizeMultiline(input.description, 2000) || null) : null,
      priceCents: price!,
      quantity: Math.trunc(quantityRaw),
      diagram: diagramIdFor(input.diagram),
      images,
      featured: input.featured === true || input.featured === "on" || input.featured === "true",
      archived: input.archived === true || input.archived === "on" || input.archived === "true",
      provenance: optionalText(input.provenance, 200),
    },
  };
}

function parseMeasurements(value: unknown): Array<{ label: string; value: string }> {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((row) => row.split(/[=:]/))
      .filter((parts) => parts.length === 2)
      .map(([label, amount]) => ({ label: sanitizeText(label, 40), value: sanitizeText(amount, 40) }))
      .filter((entry) => entry.label.length > 0 && entry.value.length > 0);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return null;
        const record = entry as Record<string, unknown>;
        const label = sanitizeText(record.label, 40);
        const amount = sanitizeText(record.value, 40);
        return label.length > 0 && amount.length > 0 ? { label, value: amount } : null;
      })
      .filter((entry): entry is { label: string; value: string } => entry !== null);
  }
  return [];
}

function parseImages(value: unknown): ProductImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return { src: sanitizeText(entry, 500), alt: "" };
      if (typeof entry === "object" && entry !== null) {
        const record = entry as Record<string, unknown>;
        return { src: sanitizeText(record.src, 500), alt: sanitizeText(record.alt, 200) };
      }
      return null;
    })
    .filter((entry): entry is ProductImage => entry !== null && isImageSrc(entry.src));
}

/**
 * A stored image is either a path inside the site's own `/public` directory or an absolute http(s)
 * URL (that is how a Supabase Storage bucket hands files back). Anything else - `javascript:`, a
 * relative path that escapes the root - is dropped rather than stored.
 */
export function isImageSrc(src: string): boolean {
  if (src.includes("..") || src.includes(" ") || src.includes('"') || src.includes("'")) return false;
  if (src.startsWith("/")) return src.startsWith("//") === false;
  return /^https:\/\/[^\s"'<>]+$/i.test(src);
}

export function diagramIdFor(value: unknown): DiagramId | null {
  const clean = sanitizeText(value, 16).toLowerCase();
  const allowed: DiagramId[] = ["coat", "jacket", "shirt", "trousers", "skirt", "dress", "scarf", "purse"];
  return allowed.includes(clean as DiagramId) ? (clean as DiagramId) : null;
}

/** Guard for list pages: a query param that is not a known value falls back rather than throwing. */
export function pickFrom<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (allowed as readonly string[]).includes(clean) ? (clean as T) : fallback;
}

export function pickOptionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | "all" {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (clean.length === 0 || clean === "all") return "all";
  return (allowed as readonly string[]).includes(clean) ? (clean as T) : "all";
}

export function priceCapFrom(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const cents = parseUsdToCents(typeof value === "string" ? value : Number(value));
  return cents === null || cents <= 0 ? null : cents;
}

export function booleanParam(value: unknown): boolean {
  return value === "1" || value === "true" || value === "on";
}

export function productToDraft(product: Product): Record<string, unknown> {
  return {
    name: product.name,
    slug: product.slug,
    era: product.era ?? "",
    categories: product.categories,
    genders: product.genders,
    sizeLabel: product.sizeLabel ?? "",
    measurements: product.measurements,
    condition: product.condition ?? "",
    description: product.description ?? "",
    priceCents: product.priceCents,
    quantity: product.quantity,
    images: product.images,
    diagram: product.diagram ?? "",
    featured: product.featured,
    archived: product.archived,
    provenance: product.provenance ?? "",
  };
}
