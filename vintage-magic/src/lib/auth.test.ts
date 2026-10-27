import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_COOKIE,
  adminBlockReason,
  adminConfigured,
  clearFailedAttempts,
  createSessionToken,
  registerFailedAttempt,
  verifyAdminPassword,
  verifySessionToken,
} from "./auth";

/**
 * Admin authorisation is the one place where a mistake is not cosmetic. These tests pin the shape of
 * the token check and, more importantly, that an unconfigured shop is closed rather than open with a
 * guessed password.
 */

const SECRET = "test-session-secret-value";

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearFailedAttempts("login:1.1.1.1");
  clearFailedAttempts("login:2.2.2.2");
});

describe("configuration", () => {
  it("is closed with a stated reason when the shop has no password", () => {
    expect(adminConfigured()).toBe(true);
    expect(adminBlockReason()).toBeNull();

    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(adminConfigured()).toBe(false);
    expect(adminBlockReason()).toMatch(/ADMIN_PASSWORD/);
  });

  it("refuses to run a session in production without a secret, and never guesses one", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(adminBlockReason()).toMatch(/ADMIN_SESSION_SECRET/);
    expect(createSessionToken()).toBeNull();
    expect(verifySessionToken("anything.at-all")).toBe(false);

    // Outside production a per-process secret is generated so the panel is usable in development.
    vi.stubEnv("NODE_ENV", "test");
    const token = createSessionToken();
    expect(token).toBeTruthy();
    expect(verifySessionToken(token ?? undefined)).toBe(true);
  });

  it("names the cookie it reads, so the page and the guard cannot drift", () => {
    expect(ADMIN_COOKIE).toBe("vm_admin_session");
  });
});

describe("password check", () => {
  it("accepts the exact configured password and nothing else", () => {
    expect(verifyAdminPassword("correct horse battery staple")).toBe(true);
    expect(verifyAdminPassword("correct horse battery stapel")).toBe(false);
    expect(verifyAdminPassword("correct horse battery staple ")).toBe(false);
    expect(verifyAdminPassword("")).toBe(false);
  });

  it("never passes anything while the shop has no password set", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(verifyAdminPassword("")).toBe(false);
    expect(verifyAdminPassword("correct horse battery staple")).toBe(false);
  });
});

describe("session token", () => {
  it("verifies a freshly minted token", () => {
    const token = createSessionToken();
    expect(token).toBeTruthy();
    expect(verifySessionToken(token ?? undefined)).toBe(true);
  });

  it("rejects tampering, garbage and expiry", () => {
    const token = createSessionToken(Date.UTC(2026, 0, 1, 12))!;
    expect(verifySessionToken(`${token}x`)).toBe(false);
    expect(verifySessionToken("nonsense")).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken(token, Date.UTC(2026, 0, 1, 12) + 9 * 60 * 60 * 1000)).toBe(false);
  });

  it("never accepts a token it did not sign", () => {
    expect(verifySessionToken("1799999999999.deadbeef")).toBe(false);
    expect(verifySessionToken("")).toBe(false);
  });

  it("does not accept a token signed with a different secret", () => {
    const token = createSessionToken()!;
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-wholly-different-secret");
    expect(verifySessionToken(token)).toBe(false);
  });
});

describe("login throttling", () => {
  it("blocks a key after the attempt limit and unblocks after the window", () => {
    const key = "login:1.1.1.1";
    const start = 1_700_000_000_000;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // The count has to survive a burst: five reads at the same instant are five attempts.
      expect(registerFailedAttempt(key, start + attempt).allowed).toBe(true);
    }
    const blocked = registerFailedAttempt(key, start + 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryInMs).toBeGreaterThan(0);

    // The counter is keyed per client, so another visitor is unaffected.
    expect(registerFailedAttempt("login:2.2.2.2", start).allowed).toBe(true);

    clearFailedAttempts(key);
    expect(registerFailedAttempt(key, start).allowed).toBe(true);
  });

  it("lets attempts expire with the window instead of blocking forever", () => {
    const key = "login:1.1.1.1";
    const start = 1_700_000_000_000;
    for (let attempt = 0; attempt < 6; attempt += 1) registerFailedAttempt(key, start);
    expect(registerFailedAttempt(key, start).allowed).toBe(false);
    expect(registerFailedAttempt(key, start + 6 * 60 * 1000).allowed).toBe(true);
  });
});
