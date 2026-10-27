import crypto from "node:crypto";
import { env } from "./config";

/**
 * Admin authorisation. The check happens on the server, in every mutating route and in the admin
 * layout - hiding a control is never treated as protection.
 *
 * - `ADMIN_PASSWORD` gates the sign-in. If it is unset, admin is switched off and the sign-in
 *   page explains how to turn it on rather than falling back to a guessable default.
 * - The session cookie holds an expiry and an HMAC of it. Comparison is constant time.
 * - `ADMIN_SESSION_SECRET` is required in production; in development an ephemeral per-process
 *   secret is generated, which means signing in again after a server restart.
 */

export const ADMIN_COOKIE = "vm_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

let devSecret: string | null = null;

function sessionSecret(): string | null {
  const configured = env("ADMIN_SESSION_SECRET");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  if (devSecret === null) devSecret = crypto.randomBytes(32).toString("base64url");
  return devSecret;
}

export function adminConfigured(): boolean {
  return env("ADMIN_PASSWORD") !== null && sessionSecret() !== null;
}

export function adminBlockReason(): string | null {
  if (env("ADMIN_PASSWORD") === null) return "Set ADMIN_PASSWORD to enable the admin panel.";
  if (sessionSecret() === null) return "Set ADMIN_SESSION_SECRET (a long random string) to enable admin sessions.";
  return null;
}

function digest(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

/** Length-independent comparison: hashing first stops `timingSafeEqual` leaking the password length. */
export function verifyAdminPassword(candidate: string): boolean {
  const expected = env("ADMIN_PASSWORD");
  if (expected === null) return false;
  const candidateDigest = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  return candidateDigest.length === expectedDigest.length && crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

export function createSessionToken(now = Date.now()): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const expiresAt = now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${digest(String(expiresAt), secret)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const [expiresRaw, signature] = token.split(".");
  if (!expiresRaw || !signature) return false;
  const expiresAt = Number.parseInt(expiresRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const expected = Buffer.from(digest(expiresRaw, secret), "base64url");
  const provided = Buffer.from(signature, "base64url");
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

/**
 * Coarse login throttling: in-memory, per process, per key (the caller uses the client address).
 *
 * The count is tied to the time of the first attempt in the window, not to the block flag, so a
 * burst really does accumulate - a counter that resets on every read would look like protection and
 * be nothing. It is not a substitute for a durable store in a multi-instance deployment; it is the
 * floor that makes password guessing expensive on a single one.
 */
interface AttemptWindow {
  count: number;
  firstAt: number;
  blockedUntil: number;
}

const attempts = new Map<string, AttemptWindow>();

export function registerFailedAttempt(key: string, now = Date.now(), limit = 6, windowMs = 5 * 60 * 1000): { allowed: boolean; retryInMs: number } {
  const entry = attempts.get(key);
  if (entry && entry.blockedUntil > now) return { allowed: false, retryInMs: entry.blockedUntil - now };

  const withinWindow = entry && now - entry.firstAt < windowMs ? entry : null;
  const count = withinWindow ? withinWindow.count + 1 : 1;
  const firstAt = withinWindow ? withinWindow.firstAt : now;

  if (count >= limit) {
    attempts.set(key, { count, firstAt, blockedUntil: now + windowMs });
    return { allowed: false, retryInMs: windowMs };
  }
  attempts.set(key, { count, firstAt, blockedUntil: 0 });
  return { allowed: true, retryInMs: 0 };
}

export function clearFailedAttempts(key: string): void {
  attempts.delete(key);
}

export function sessionCookieName(): string {
  return ADMIN_COOKIE;
}
