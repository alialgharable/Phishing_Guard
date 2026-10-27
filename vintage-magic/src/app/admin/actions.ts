"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ADMIN_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS, clearFailedAttempts, createSessionToken, registerFailedAttempt, verifyAdminPassword } from "@/lib/auth";
import { getRepository } from "@/lib/data";
import { saveProductImage } from "@/lib/media";
import { denyAdminAction } from "@/lib/server/guard";
import { sanitizeMultiline, sanitizeText, validateProductDraft } from "@/lib/validation";
import { ORDER_STATUSES, type OrderStatus, type ProductImage, type SiteContent } from "@/lib/types";

/**
 * Admin writes.
 *
 * These are Server Actions, so authorisation runs on the server for every call - the panel being
 * visible in the browser proves nothing - and Next.js additionally rejects cross-origin POSTs to
 * actions. Input is validated with the same functions the rest of the app uses, and a failure comes
 * back as field errors instead of a half-written row.
 */

export type ActionOutcome = { ok: true; message?: string } | { ok: false; error: string; errors?: Record<string, string> };

const MUTATED_PATHS = ["/", "/archive", "/about", "/contact", "/admin", "/admin/products", "/admin/orders", "/admin/content"];

function revalidateShop(): void {
  for (const path of MUTATED_PATHS) revalidatePath(path, "page");
  revalidatePath("/archive/[slug]", "page");
}

/* ------------------------------------------------------------------------ auth -- */

export async function signInAction(formData: FormData): Promise<ActionOutcome> {
  const password = sanitizeText(formData.get("password"), 200);
  const forwarded = await headers();
  const key = (forwarded.get("x-forwarded-for") ?? "local").split(",")[0]!.trim() || "local";

  const gate = registerFailedAttempt(`login:${key}`);
  if (!gate.allowed) {
    return { ok: false, error: `Too many attempts. Try again in ${Math.max(1, Math.ceil(gate.retryInMs / 1000))} seconds.` };
  }

  if (!verifyAdminPassword(password)) {
    return { ok: false, error: "That password is not the one the shop configured." };
  }

  const token = createSessionToken();
  if (!token) return { ok: false, error: "Admin sessions are not configured on this server: set ADMIN_SESSION_SECRET." };

  clearFailedAttempts(`login:${key}`);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/admin");
  return { ok: true, message: "Signed in." };
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

/* --------------------------------------------------------------------- product -- */

export interface ProductActionPayload {
  id?: string;
  name: string;
  slug: string;
  era: string;
  categories: string[];
  genders: string[];
  sizeLabel: string;
  price: string;
  quantity: number;
  condition: string;
  description: string;
  provenance: string;
  diagram: string;
  featured: boolean;
  archived: boolean;
  measurements: Array<{ label: string; value: string }>;
  images: ProductImage[];
}

export type ProductSaveOutcome = { ok: true; id: string; slug: string; isNew: boolean } | { ok: false; error: string; errors?: Record<string, string> };

export async function saveProductAction(payload: ProductActionPayload): Promise<ProductSaveOutcome> {
  const denied = await denyAdminAction();
  if (denied) return { ok: false, error: denied.error };

  const repository = getRepository();
  const { value, errors } = validateProductDraft({
    name: payload.name,
    slug: payload.slug,
    era: payload.era,
    categories: payload.categories,
    genders: payload.genders,
    sizeLabel: payload.sizeLabel,
    price: payload.price,
    quantity: payload.quantity,
    condition: payload.condition,
    description: payload.description,
    provenance: payload.provenance,
    diagram: payload.diagram,
    featured: payload.featured,
    archived: payload.archived,
    measurements: payload.measurements,
    images: payload.images,
  });
  if (!value) return { ok: false, error: "The entry is incomplete.", errors };

  const takenSlugs = (await repository.listProducts()).filter((product) => product.id !== payload.id).map((product) => product.slug);
  const slug = value.slug ?? slugFrom(value.name, takenSlugs);
  if (takenSlugs.includes(slug)) {
    return { ok: false, error: "That address is already used by another piece.", errors: { slug: "Another entry owns this slug. Change it or remove the other record." } };
  }

  const fields = { ...value, slug };
  try {
    if (payload.id) {
      const updated = await repository.updateProduct(payload.id, fields);
      if (!updated) return { ok: false, error: "That piece is no longer in the store - it may have been deleted in another tab." };
      revalidateShop();
      return { ok: true, id: updated.id, slug: updated.slug, isNew: false };
    }
    const created = await repository.createProduct(fields);
    revalidateShop();
    return { ok: true, id: created.id, slug: created.slug, isNew: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `The store refused the write: ${error.message}` : "The store refused the write." };
  }
}

function slugFrom(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "piece";
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

/** Form-shaped wrapper so a `<form action={…}>` can drive the delete: an inline arrow cannot cross the server/client boundary. */
export async function deleteProductFormAction(formData: FormData): Promise<ActionOutcome> {
  const id = sanitizeText(formData.get("id"), 64);
  if (!id) return { ok: false, error: "The form lost the id of the piece to delete." };
  return deleteProductAction(id);
}

export async function deleteProductAction(id: string): Promise<ActionOutcome> {
  const denied = await denyAdminAction();
  if (denied) return { ok: false, error: denied.error };
  try {
    const removed = await getRepository().deleteProduct(id);
    if (!removed) return { ok: false, error: "Nothing with that id is in the store any more." };
    revalidateShop();
    return { ok: true, message: "The record was deleted." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The delete failed." };
  }
}

export async function setStockAction(formData: FormData): Promise<ActionOutcome> {
  const denied = await denyAdminAction();
  if (denied) return denied;
  const id = sanitizeText(formData.get("id"), 64);
  const quantity = Math.trunc(Number(formData.get("quantity")));
  if (!id || !Number.isFinite(quantity) || quantity < 0 || quantity > 999) return { ok: false, error: "Stock must be a whole number between 0 and 999." };
  try {
    const updated = await getRepository().setQuantity(id, quantity);
    if (!updated) return { ok: false, error: "That piece is no longer in the store." };
    revalidateShop();
    return { ok: true, message: `${updated.name} now shows quantity ${updated.quantity}${updated.quantity === 0 ? " (collected)" : ""}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The write failed." };
  }
}

export async function toggleProductFlagAction(formData: FormData): Promise<ActionOutcome> {
  const denied = await denyAdminAction();
  if (denied) return denied;
  const id = sanitizeText(formData.get("id"), 64);
  const flag = sanitizeText(formData.get("flag"), 16);
  if (!id || (flag !== "featured" && flag !== "archived")) return { ok: false, error: "Unknown flag." };
  const repository = getRepository();
  const product = await repository.findProductById(id);
  if (!product) return { ok: false, error: "That piece is no longer in the store." };
  try {
    await repository.updateProduct(id, { [flag]: !product[flag] } as { featured?: boolean; archived?: boolean });
    revalidateShop();
    return { ok: true, message: `${product.name}: ${flag} is now ${product[flag] ? "off" : "on"}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The write failed." };
  }
}

export async function uploadImageAction(formData: FormData): Promise<{ ok: true; image: ProductImage } | { ok: false; error: string }> {
  const denied = await denyAdminAction();
  if (denied) return { ok: false, error: denied.error };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file arrived." };
  const result = await saveProductImage(file);
  if (!result.ok) return result;
  const alt = sanitizeText(formData.get("alt"), 200) || `${file.name.replace(/\.[a-z0-9]+$/i, "")} — photographed for the archive`;
  return { ok: true, image: { src: result.src, alt } };
}

/* ----------------------------------------------------------------------- orders -- */

export async function updateOrderStatusAction(formData: FormData): Promise<ActionOutcome> {
  const denied = await denyAdminAction();
  if (denied) return denied;
  const id = sanitizeText(formData.get("id"), 64);
  const raw = sanitizeText(formData.get("status"), 24).toLowerCase();
  const status = (ORDER_STATUSES as readonly string[]).includes(raw) ? (raw as OrderStatus) : null;
  if (!id || !status) return { ok: false, error: "Choose a real status for the order." };
  try {
    const order = await getRepository().updateOrderStatus(id, status);
    if (!order) return { ok: false, error: "That order is not in the store." };
    revalidateShop();
    return { ok: true, message: `${order.reference} is now "${status}".` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The write failed." };
  }
}

/* ---------------------------------------------------------------------- content -- */

export async function saveContentAction(formData: FormData): Promise<ActionOutcome> {
  const denied = await denyAdminAction();
  if (denied) return denied;
  const patch: Partial<SiteContent> = {
    phone: textOrNull(formData.get("phone"), 40),
    email: textOrNull(formData.get("email"), 120),
    instagram: textOrNull(formData.get("instagram"), 60),
    whatsapp: textOrNull(formData.get("whatsapp"), 40),
    addressLine: textOrNull(formData.get("addressLine"), 200),
    hours: textOrNull(formData.get("hours"), 160),
    aboutHeading: sanitizeText(formData.get("aboutHeading"), 120) || "SOME THINGS DESERVE ANOTHER LIFE.",
    aboutParagraphs: sanitizeMultiline(formData.get("aboutParagraphs"), 6000)
      .split(/\r?\n\s*\r?\n/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter((paragraph) => paragraph.length > 0)
      .slice(0, 8),
    atelierTeaserEnabled: formData.get("atelierTeaserEnabled") === "on",
    atelierTeaserCopy: sanitizeMultiline(formData.get("atelierTeaserCopy"), 800),
  };
  if (patch.email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(patch.email)) return { ok: false, error: "That email address is not valid.", errors: { email: "Use an address like shop@example.com, or leave it empty." } };
  if (patch.instagram) patch.instagram = patch.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
  try {
    await getRepository().saveSiteContent(patch);
    revalidateShop();
    return { ok: true, message: "Store content saved." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The write failed." };
  }
}

function textOrNull(value: unknown, max: number): string | null {
  const clean = sanitizeText(value, max);
  return clean.length > 0 ? clean : null;
}

export async function setMessageHandledAction(formData: FormData): Promise<ActionOutcome> {
  const denied = await denyAdminAction();
  if (denied) return denied;
  const id = sanitizeText(formData.get("id"), 64);
  if (!id) return { ok: false, error: "Missing message id." };
  const repository = getRepository();
  const messages = await repository.listMessages();
  const message = messages.find((entry) => entry.id === id);
  if (!message) return { ok: false, error: "That enquiry is not in the store." };
  try {
    await repository.markMessageHandled(id, formData.get("handled") !== "on");
    revalidateShop();
    return { ok: true, message: `Marked ${message.name}'s enquiry.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The write failed." };
  }
}
