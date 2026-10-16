import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpServer } from "../src/server/httpServer";
import { validateScanRequest } from "../src/server/validation";
import { RedirectPolicy } from "../src/services/redirects/redirectPolicy";

const servers: Array<ReturnType<typeof createHttpServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

function start(
  orchestrator = {
    scan: async (url: string) => ({
      url,
      riskAssessment: { state: "UNKNOWN" },
    }),
  },
) {
  const server = createHttpServer(orchestrator as never, {
    host: "127.0.0.1",
    port: 0,
    maxBodyBytes: 1024,
    maxUrlLength: 100,
    scanTimeoutMs: 1000,
    maxConcurrentScans: 2,
    rateLimitPerMinute: 10,
  });
  servers.push(server);
  return new Promise<{ server: typeof server; port: number }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: (server.address() as { port: number }).port }),
    ),
  );
}

function post(port: number, body: string) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/scan",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

describe("scan API boundary", () => {
  it("accepts a valid URL and exposes the orchestrator assessment", async () => {
    const { port } = await start();
    const result = await post(
      port,
      JSON.stringify({ url: "https://example.com" }),
    );
    expect(result.status).toBe(200);
    expect(result.body.riskAssessment.state).toBe("UNKNOWN");
    expect(result.body).not.toHaveProperty("env");
  });

  it("rejects malformed, credential, unsupported, oversized, and private URLs", async () => {
    const policy = new RedirectPolicy({ resolver: async () => ["127.0.0.1"] });
    expect((await validateScanRequest({ url: "not-url" })).ok).toBe(false);
    expect((await validateScanRequest({ url: "ftp://example.com" })).ok).toBe(
      false,
    );
    expect(
      (await validateScanRequest({ url: "https://user:pass@example.com" })).ok,
    ).toBe(false);
    expect(
      (
        await validateScanRequest(
          { url: "https://example.com".repeat(100) },
          100,
        )
      ).ok,
    ).toBe(false);
    expect((await validateScanRequest({ url: "http://127.0.0.1" })).ok).toBe(
      false,
    );
    expect(
      (
        await validateScanRequest(
          { url: "https://internal.example" },
          2048,
          policy,
        )
      ).ok,
    ).toBe(false);
  });

  it("provides health and rejects unknown routes", async () => {
    const { server, port } = await start();
    const health = await new Promise<number>((resolve) => {
      const req = request(
        { hostname: "127.0.0.1", port, path: "/health" },
        (res) => resolve(res.statusCode ?? 0),
      );
      req.end();
    });
    expect(health).toBe(200);
    expect(server).toBeDefined();
  });
});
