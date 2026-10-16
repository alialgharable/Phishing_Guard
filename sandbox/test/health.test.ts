import { afterEach, describe, expect, it } from "vitest";
import type http from "node:http";
import { createServer } from "../src/http.js";

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function start(health: () => Promise<unknown>) {
  server = createServer({
    token: "secret-token",
    health,
    ready: health,
    analyze: async () => ({
      status: "available",
      redirects: [],
      domainsContacted: [],
      networkRequests: [],
      downloads: [],
      screenshots: [],
      behaviorObservations: [],
    }),
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("listen failed");
  return `http://127.0.0.1:${address.port}`;
}

describe("health endpoints", () => {
  it("returns ok when diagnostics are ready", async () => {
    const base = await start(async () => ({ status: "ok", browser: "chromium", version: "test", sandbox: "ready" }));
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", browser: "chromium", sandbox: "ready" });
  });

  it("returns 503 when Chromium diagnostics fail", async () => {
    const base = await start(async () => ({ status: "error", browser: "chromium", sandbox: "not_ready", message: "missing executable" }));
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "error", browser: "chromium", sandbox: "not_ready" });
  });
});
