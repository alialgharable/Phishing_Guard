import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type http from "node:http";
import { loadConfig } from "../src/config.js";
import { checkChromium } from "../src/diagnostics.js";
import { createServer } from "../src/http.js";
import { PlaywrightIsolationBackend } from "../src/browser-sandbox.js";

const run = process.env.RUN_SANDBOX_E2E === "1";
const describeE2E = run ? describe : describe.skip;
let server: http.Server | undefined;
let baseUrl = "";

describeE2E("real sandbox browser e2e", () => {
  beforeAll(async () => {
    process.env.SANDBOX_API_TOKEN = process.env.SANDBOX_API_TOKEN ?? "dev-internal-token";
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
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    server = undefined;
  });

  it("authenticates, launches Chromium, navigates to example.com, observes requests, screenshots, and returns JSON", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: "ok", browser: "chromium", sandbox: "ready" });

    const response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: { authorization: "Bearer dev-internal-token", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", requestId: "e2e-example" }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe("available");
    expect(result.finalUrl).toMatch(/^https:\/\/example\.com\/?/);
    expect(result.networkRequests.length).toBeGreaterThan(0);
    expect(result.domainsContacted).toContain("example.com");
    expect(result.screenshots.length).toBeGreaterThan(0);
    expect(result.behaviorObservations.some((item: { type?: string }) => item.type === "sandbox_page_loaded")).toBe(true);
  }, 120_000);
});
