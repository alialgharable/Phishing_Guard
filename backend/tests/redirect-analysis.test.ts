import { describe, expect, it, vi } from "vitest";
import { RedirectAnalyzer } from "../src/services/redirects/redirectAnalyzer";
import { RedirectPolicy } from "../src/services/redirects/redirectPolicy";
import { RedirectFetcher } from "../src/services/redirects/redirectFetcher";

function publicPolicy(maxHops = 8) {
  return new RedirectPolicy({
    config: { maxHops, timeoutMs: 1000, maxResponseBytes: 1024 },
    resolver: vi.fn().mockResolvedValue(["93.184.216.34"]),
  });
}

describe("redirect analysis", () => {
  it("records a normal redirect chain and final URL", async () => {
    const policy = publicPolicy();
    const responses = new Map([
      [
        "https://example.com/start",
        new Response("", { status: 302, headers: { location: "/final" } }),
      ],
      ["https://example.com/final", new Response("ok", { status: 200 })],
    ]);
    const fetcher = {
      fetch: vi.fn(async (url: string) => ({
        response: responses.get(url)!,
        durationMs: 4,
      })),
    } as unknown as RedirectFetcher;
    const result = await new RedirectAnalyzer({ policy, fetcher }).analyze(
      "https://example.com/start",
    );
    expect(result.completed).toBe(true);
    expect(result.finalUrl).toBe("https://example.com/final");
    expect(result.redirectCount).toBe(1);
    expect(result.hops).toHaveLength(2);
    expect(result.evidence.some((item) => item.type === "redirect-chain")).toBe(
      true,
    );
  });

  it("blocks localhost and private destinations before fetching", async () => {
    const policy = publicPolicy();
    const fetcher = { fetch: vi.fn() } as unknown as RedirectFetcher;
    const result = await new RedirectAnalyzer({ policy, fetcher }).analyze(
      "http://127.0.0.1/admin",
    );
    expect(result.blockedDestination).toBe(true);
    expect(result.completed).toBe(false);
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(
      result.evidence.some((item) => item.type === "blocked-destination"),
    ).toBe(true);
  });

  it("detects redirect loops and enforces the hop limit", async () => {
    const policy = publicPolicy(1);
    const fetcher = {
      fetch: vi.fn(async (url: string) => ({
        response: new Response("", {
          status: 302,
          headers: { location: url.endsWith("/a") ? "/b" : "/a" },
        }),
        durationMs: 1,
      })),
    } as unknown as RedirectFetcher;
    const result = await new RedirectAnalyzer({ policy, fetcher }).analyze(
      "https://example.com/a",
    );
    expect(result.maxRedirectsReached).toBe(true);
    expect(result.redirectCount).toBe(2);
    expect(result.completed).toBe(false);
  });

  it("rejects unsupported protocols and credential-bearing URLs", async () => {
    const policy = publicPolicy();
    const fetcher = { fetch: vi.fn() } as unknown as RedirectFetcher;
    const fileResult = await new RedirectAnalyzer({ policy, fetcher }).analyze(
      "file:///etc/passwd",
    );
    expect(fileResult.blockedDestination).toBe(true);
    const credentialResult = await new RedirectAnalyzer({
      policy,
      fetcher,
    }).analyze("https://user:pass@example.com");
    expect(credentialResult.blockedDestination).toBe(true);
  });

  it("uses a controlled fetcher with manual redirect mode and response limits", async () => {
    const policy = publicPolicy();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const controlled = new RedirectFetcher({ policy, fetcher });
    const result = await controlled.fetch("https://example.com");
    expect(result.response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ redirect: "manual", method: "GET" }),
    );
  });
});
