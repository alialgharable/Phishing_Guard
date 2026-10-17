import fs from "node:fs";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { checkChromium } from "../src/diagnostics.js";
import { PlaywrightIsolationBackend } from "../src/browser-sandbox.js";
import { createServer } from "../src/http.js";

/**
 * Real-browser proof that redirect security is enforced before a request leaves the
 * sandbox, and that a policy refusal is reported as `blocked` rather than `error`.
 *
 * Runs only with a real Chromium available:
 *
 *   RUN_SANDBOX_E2E=1 npm --workspace @phishguard/sandbox-service run test:e2e
 *
 * The "did the internal service see a connection" counter is only meaningful when the
 * browser shares this machine's loopback. Inside Docker the container has its own, so
 * that one assertion is skipped there; the `outcome: "attempted"` / no-status
 * assertions hold in both cases.
 */
const enabled = process.env.RUN_SANDBOX_E2E === "1";
const describeE2E = enabled ? describe : describe.skip;
const SECRET_BODY = "SECRET-INTERNAL-PAGE-DO-NOT-SERVE";
const TOKEN = "dev-internal-token";

async function reachable(url: string): Promise<boolean> {
  if (!enabled) return false;
  try {
    const response = await fetch(url, { redirect: "manual" });
    return response.status >= 200;
  } catch {
    return false;
  }
}

// Evaluated while the suite is collected, because `it.runIf` needs the answer there.
const egressOk = await reachable("https://example.com");
const redirectorOk = await reachable("https://httpbin.org/status/200");

/** A listener standing in for the internal service a scan must never reach. */
function startProhibitedTarget(): Promise<{ server: http.Server; port: number; hits: () => number }> {
  let hits = 0;
  const server = http.createServer((_request, response) => {
    hits += 1;
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(SECRET_BODY);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("prohibited target did not bind a TCP port"));
        return;
      }
      resolve({ server, port: address.port, hits: () => hits });
    });
  });
}

/** The result subset these assertions care about. */
interface Result {
  status: string;
  terminationReason?: string;
  message?: string;
  blockedUrl?: string;
  finalUrl?: string;
  httpStatus?: number;
  redirects: Array<{ url: string; status: number; location?: string }>;
  networkRequests: Array<{ url: string; outcome?: string; status?: number; blockedReason?: string }>;
  screenshots: unknown[];
  behaviorObservations: Array<{ type: string; description?: string; rawEvidence?: unknown[] }>;
}

let server: http.Server | undefined;
let baseUrl = "";
let prohibited: { server: http.Server; port: number; hits: () => number } | undefined;

function target(): { port: number; hits: () => number } {
  if (!prohibited) throw new Error("prohibited target fixture is not running");
  return prohibited;
}

/** True when the browser and this process share a network namespace. */
function sharesLoopbackWithBrowser(): boolean {
  return !fs.existsSync("/.dockerenv");
}

async function analyze(url: string, requestId: string): Promise<Result> {
  const response = await fetch(`${baseUrl}/analyze`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ url, requestId }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Result;
}

function evidenceOf(result: Result, type: string): Result["behaviorObservations"] {
  return result.behaviorObservations.filter((item) => item.type === type);
}

describeE2E("real browser redirect security", () => {
  beforeAll(async () => {
    process.env.SANDBOX_API_TOKEN = process.env.SANDBOX_API_TOKEN ?? TOKEN;
    const config = loadConfig();
    const backend = new PlaywrightIsolationBackend(config);
    server = createServer({
      token: config.apiToken,
      analyze: (input) => backend.analyze(input),
      health: async () => {
        const browser = await checkChromium();
        return browser.ok
          ? { status: "ok", browser: browser.browser, version: browser.version, sandbox: "ready" }
          : { status: "error", browser: browser.browser, sandbox: "not_ready", message: browser.error };
      },
      ready: async () => ({ status: "ok" }),
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not listen");
    baseUrl = `http://127.0.0.1:${address.port}`;
    prohibited = await startProhibitedTarget();
  }, 180_000);

  afterAll(async () => {
    prohibited?.server.close();
    prohibited = undefined;
    const closing = server;
    server = undefined;
    if (closing) await new Promise<void>((resolve) => closing.close(() => resolve()));
  });

  it("blocks a direct navigation to loopback without contacting it", async () => {
    const blocked = `http://127.0.0.1:${target().port}/admin`;
    const result = await analyze(blocked, "e2e-loopback-direct");
    expect(result.status).toBe("blocked");
    expect(result.terminationReason).toBe("destination_blocked");
    expect(result.blockedUrl).toBe(blocked);
    expect(evidenceOf(result, "sandbox_destination_blocked")).toHaveLength(1);
    expect(result.message).toContain("127.0.0.1");
    // Nothing was navigated, so nothing may be reported about a page.
    expect(result.screenshots).toEqual([]);
    expect(result.httpStatus).toBeUndefined();
    expect(result.finalUrl).toBeUndefined();
    if (sharesLoopbackWithBrowser()) expect(target().hits()).toBe(0);
  }, 120_000);

  it.runIf(redirectorOk)("reports a public page redirecting to loopback as blocked, not as an error", async () => {
    const blocked = `http://127.0.0.1:${target().port}/admin`;
    const result = await analyze(`https://httpbin.org/redirect-to?url=${encodeURIComponent(blocked)}&status_code=302`, "e2e-redirect-loopback");
    // This is the regression: the policy refused the redirect hop, so the outcome has
    // to be a block with a reason, not the opaque Chromium abort error.
    expect(result.status).toBe("blocked");
    expect(result.terminationReason).toBe("redirect_destination_blocked");
    expect(result.blockedUrl).toBe(blocked);
    const refusals = [...evidenceOf(result, "sandbox_redirect_blocked"), ...evidenceOf(result, "sandbox_navigation_blocked"), ...evidenceOf(result, "sandbox_request_blocked")];
    expect(refusals.length).toBeGreaterThan(0);
    expect(JSON.stringify(refusals)).toContain("127.0.0.1");
    // The redirect response was real; the hop it pointed at was attempted only.
    expect(result.redirects.some((item) => String(item.location ?? "").includes("127.0.0.1"))).toBe(true);
    const attempts = result.networkRequests.filter((item) => String(item.url).includes("/admin"));
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every((item) => item.outcome === "attempted")).toBe(true);
    expect(attempts.every((item) => item.status === undefined)).toBe(true);
    expect(attempts.every((item) => typeof item.blockedReason === "string")).toBe(true);
    // No successful response and no screenshot from the prohibited destination.
    expect(result.httpStatus).toBeUndefined();
    expect(result.screenshots).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(SECRET_BODY);
    if (sharesLoopbackWithBrowser()) expect(target().hits()).toBe(0);
  }, 120_000);

  it.runIf(redirectorOk)("blocks redirects into private space and link-local metadata", async () => {
    for (const [blocked, requestId] of [
      ["http://10.0.0.1/admin", "e2e-redirect-private"],
      ["http://169.254.169.254/latest/meta-data/", "e2e-redirect-metadata"],
      ["http://[::1]:8080/", "e2e-redirect-v6-loopback"],
      [`http://localhost:${target().port}/admin`, "e2e-redirect-localhost-name"],
    ] as const) {
      const result = await analyze(`https://httpbin.org/redirect-to?url=${encodeURIComponent(blocked)}&status_code=302`, requestId);
      expect(result.status, blocked).toBe("blocked");
      expect(result.terminationReason, blocked).toBe("redirect_destination_blocked");
      expect(result.blockedUrl, blocked).toBe(blocked);
      expect(result.screenshots, blocked).toEqual([]);
    }
    if (sharesLoopbackWithBrowser()) expect(target().hits()).toBe(0);
  }, 180_000);

  it.runIf(redirectorOk)("follows a legitimate public-to-public redirect and captures real observations", async () => {
    const result = await analyze("https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.com%2F&status_code=302", "e2e-redirect-public");
    expect(result.status).toBe("available");
    expect(String(result.finalUrl)).toMatch(/^https:\/\/(www\.)?example\.com\/?/);
    expect(result.redirects.length).toBeGreaterThan(0);
    expect(result.networkRequests.some((item) => item.outcome === "responded" && typeof item.status === "number")).toBe(true);
    expect(result.screenshots.length).toBeGreaterThan(0);
    expect(evidenceOf(result, "sandbox_page_loaded")).toHaveLength(1);
    expect(evidenceOf(result, "sandbox_navigation_blocked")).toHaveLength(0);
    expect(result.blockedUrl).toBeUndefined();
    // A scan with nothing refused must not carry a message of any kind.
    expect(result.message).toBeUndefined();
  }, 120_000);

  it.runIf(egressOk)("reports a genuine connection failure as an error, never as a block", async () => {
    // No policy rule refuses this host; a DNS failure has to stay operational
    // uncertainty so it can never be read as a security verdict.
    const result = await analyze("https://phishguard-e2e-no-such-host.invalid/", "e2e-dns-failure");
    expect(result.status).toBe("error");
    expect(result.terminationReason).toBe("navigation_failed");
    expect(result.blockedUrl).toBeUndefined();
    expect(evidenceOf(result, "sandbox_navigation_blocked")).toHaveLength(0);
    expect(evidenceOf(result, "sandbox_request_blocked")).toHaveLength(0);
    expect(result.screenshots).toEqual([]);
  }, 120_000);

  it.runIf(egressOk)("loads a normal public page with genuine network observations", async () => {
    const result = await analyze("https://example.com/", "e2e-normal-page");
    expect(result.status).toBe("available");
    expect(result.terminationReason).toBe("completed");
    expect(result.httpStatus).toBe(200);
    expect(result.networkRequests.length).toBeGreaterThan(0);
    expect(result.networkRequests.every((item) => item.outcome === "attempted" || item.outcome === "responded")).toBe(true);
    expect(evidenceOf(result, "sandbox_request_blocked")).toHaveLength(0);
    expect(result.message).toBeUndefined();
    expect(result.screenshots.length).toBeGreaterThan(0);
  }, 120_000);
});
