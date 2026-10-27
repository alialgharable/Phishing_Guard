import { decideAdmin } from "@/lib/server/guard";

/**
 * Page-level view of the same decision the actions use, so a page can redirect instead of
 * rendering a shell around content the visitor is not allowed to see.
 */
export async function adminAccessForPage(): Promise<{ ok: true } | { ok: false; error: string }> {
  const decision = await decideAdmin();
  return decision.ok ? { ok: true } : { ok: false, error: decision.error };
}
