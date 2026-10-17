import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisContext } from "./contracts";
import { HttpSandboxAnalyzer } from "./sandbox";

const context = { url: new URL("https://public.test/offer") } as unknown as AnalysisContext;

function reply(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sandbox service result contract at the app boundary", () => {
  it("carries a policy-blocked redirect through as a block, with its reason and URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          status: "blocked",
          redirects: [{ url: "https://public.test/offer", status: 302, location: "http://127.0.0.1/admin" }],
          domainsContacted: ["public.test"],
          networkRequests: [
            { method: "GET", url: "https://public.test/offer", resourceType: "document", status: 302, outcome: "responded" },
            { method: "GET", url: "http://127.0.0.1/admin", resourceType: "document", outcome: "attempted", blockedReason: "resolved address 127.0.0.1 is blocked" },
          ],
          downloads: [],
          screenshots: [],
          behaviorObservations: [
            {
              type: "sandbox_navigation_blocked",
              severity: "medium",
              title: "Redirect blocked by sandbox policy",
              description: "GET http://127.0.0.1/admin was blocked by sandbox policy: resolved address 127.0.0.1 is blocked",
              source: "sandbox",
            },
          ],
          durationMs: 240,
          terminationReason: "redirect_destination_blocked",
          blockedUrl: "http://127.0.0.1/admin",
          message: "GET http://127.0.0.1/admin was blocked by sandbox policy: resolved address 127.0.0.1 is blocked",
          limitsReached: [],
        }),
      ),
    );

    const result = await new HttpSandboxAnalyzer("http://sandbox.test", "token").analyze(context);

    // The block has to arrive as a block; anything else and the UI shows a scan failure
    // for a URL the sandbox actually refused on policy grounds.
    expect(result.status).toBe("blocked");
    expect(result.terminationReason).toBe("redirect_destination_blocked");
    expect(result.blockedUrl).toBe("http://127.0.0.1/admin");
    expect(result.message).toContain("127.0.0.1");
    // Nothing was navigated, so nothing may be reported as loaded.
    expect(result.httpStatus).toBeUndefined();
    expect(result.finalUrl).toBeUndefined();
    expect(result.screenshots).toEqual([]);
    expect(result.redirects).toHaveLength(1);
    expect(result.networkRequests).toHaveLength(2);
    expect(result.behaviorObservations[0]?.type).toBe("sandbox_navigation_blocked");
  });

  it("keeps a genuine service failure an error and never a verdict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          status: "error",
          redirects: [],
          domainsContacted: [],
          networkRequests: [],
          downloads: [],
          screenshots: [],
          behaviorObservations: [],
          terminationReason: "navigation_failed",
          message: "net::ERR_CONNECTION_REFUSED at http://public.test/offer",
        }),
      ),
    );
    const result = await new HttpSandboxAnalyzer("http://sandbox.test", "token").analyze(context);
    expect(result.status).toBe("error");
    expect(result.terminationReason).toBe("navigation_failed");
    expect(result.blockedUrl).toBeUndefined();
    expect(result.behaviorObservations).toEqual([]);
  });

  it("reports uncertainty when the service cannot be reached at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const result = await new HttpSandboxAnalyzer("http://sandbox.test", "token").analyze(context);
    expect(result.status).toBe("error");
    expect(result.blockedUrl).toBeUndefined();
    expect(result.redirects).toEqual([]);
    expect(result.networkRequests).toEqual([]);
    expect(result.screenshots).toEqual([]);
  });
});
