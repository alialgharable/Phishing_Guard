import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/config";
import { supabaseConfigured } from "@/lib/data/supabase";

/**
 * Product image storage.
 *
 * Two real backends and no pretence of a third: with Supabase configured the bytes go to the
 * configured Storage bucket through the service-role client (never the browser), and without it they
 * are written into `public/media/uploads` so the local file store keeps working end to end. Types and
 * size are checked before anything touches the disk, and the generated name never contains user input.
 */

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type UploadResult = { ok: true; src: string; backend: "supabase" | "local" } | { ok: false; error: string };

export function storageBackend(): "supabase" | "local" {
  return supabaseConfigured() ? "supabase" : "local";
}

export async function saveProductImage(file: File): Promise<UploadResult> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `Images must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller.` };
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) return { ok: false, error: "Use a JPEG, PNG or WebP file." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const name = `${stamp}-${digest}-${randomBytes(4).toString("hex")}.${extension}`;

  if (supabaseConfigured()) return uploadToSupabase(name, bytes, file.type);
  return writeToPublicMedia(name, bytes);
}

async function writeToPublicMedia(name: string, bytes: Buffer): Promise<UploadResult> {
  const directory = path.join(process.cwd(), "public", "media", "uploads");
  await mkdir(directory, { recursive: true });
  // `name` is generated above; nothing from the request reaches this path.
  await writeFile(path.join(directory, name), bytes, { mode: 0o644 });
  return { ok: true, src: `/media/uploads/${name}`, backend: "local" };
}

async function uploadToSupabase(name: string, bytes: Buffer, type: string): Promise<UploadResult> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = env("SUPABASE_IMAGE_BUCKET") ?? "product-images";
  if (!url || !serviceKey) return { ok: false, error: "Supabase is only partly configured - both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." };

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, serviceKey, { auth: { persistSession: false }, global: { headers: { "content-type": type } } });
    const { error } = await client.storage.from(bucket).upload(name, bytes, { contentType: type, upsert: false });
    if (error) {
      return {
        ok: false,
        error: `Storage rejected the upload (${error.message}). Check that the "${bucket}" bucket exists and the service role may write to it.`,
      };
    }
    const publicUrl = client.storage.from(bucket).getPublicUrl(name).data.publicUrl;
    return { ok: true, src: publicUrl, backend: "supabase" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return { ok: false, error: `Could not reach Supabase Storage: ${reason}. Nothing was saved.` };
  }
}

/** Absolute URLs from a bucket are fine; local paths must stay inside /public. */
export function isStorableImageSrc(src: string): boolean {
  if (src.startsWith("/")) return !src.includes("..");
  return /^https?:\/\/[^\s"'<>]+$/i.test(src);
}

export const IMAGE_ACCEPT = Object.values(ALLOWED_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");
