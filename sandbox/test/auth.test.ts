import { afterEach, describe, expect, it } from "vitest";
import type http from "node:http";
import { createServer } from "../src/http.js";

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function start() {
  server = createServer({
    token: "secret-token",
    health: async () => ({ status: "ok" }),
    ready: async () => ({ status: "ok" }),
    analyze: async () => ({
      status: "available",
      finalUrl: "https://example.com/",
      redirects: [],
      domainsContacted: ["example.com"],
      networkRequests: [],
      downloads: [],
      screenshots: [],
      behaviorObservations: [],
      durationMs: 1,
      terminationReason: "completed",
      limitsReached: [],
    }),
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("listen failed");
  return `http://127.0.0.1:${address.port}`;
}

describe("sandbox API authentication", () => {
  it.each([undefined, "Bearer wrong-token"])("rejects missing/invalid token", async (authorization) => {
    const base = await start();
    const response = await fetch(`${base}/analyze`, {
      method: "POST",
      headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(response.status).toBe(401);
  });

  it("accepts a valid token", async () => {
    const base = await start();
    const response = await fetch(`${base}/analyze`, {
      method: "POST",
      headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "available", finalUrl: "https://example.com/" });
  });
});
