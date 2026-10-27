import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminBlockReason, verifySessionToken } from "@/lib/auth";

/**
 * Server-side authorisation for every admin mutation and admin-only page.
 *
 * Hiding a control in the browser is not security, so each server action and each page under
 * `/admin` asks this first: the session cookie must carry a valid, unexpired HMAC and the shop must
 * actually have an admin password configured. When either is missing the result is a refusal with a
 * reason the operator can act on - never a default password and never a silent pass.
 */

export type AdminDecision = { ok: true } | { ok: false; status: 401 | 503; error: string };

export async function decideAdmin(): Promise<AdminDecision> {
  const blocked = adminBlockReason();
  if (blocked) return { ok: false, status: 503, error: `Admin access is not configured: ${blocked}` };
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_COOKIE)?.value)) {
    return { ok: false, status: 401, error: "Your admin session has ended. Sign in again." };
  }
  return { ok: true };
}

/** Convenience for server actions: returns an error payload the caller can hand straight back. */
export async function denyAdminAction(): Promise<{ ok: false; error: string } | null> {
  const decision = await decideAdmin();
  return decision.ok ? null : { ok: false, error: decision.error };
}
