import { describe, expect, it } from "vitest";
import { analyzeURL } from "../src/services/url/urlAnalyzer";

describe("Phase 1 URL analysis", () => {
  it("normalizes common safe URLs", () => {
    const result = analyzeURL("https://google.com");
    expect(result.valid).toBe(true);
    expect(result.normalized.protocol).toBe("https");
    expect(result.normalized.hostname).toBe("google.com");
    expect(result.normalized.registrableDomain).toBe("google.com");
    expect(result.features.urlLength).toBeGreaterThan(0);
    expect(result.homoglyph.detected).toBe(false);
    expect(
      result.evidence.some((item) => item.type === "brand-similarity"),
    ).toBe(false);
  });

  it("does not treat an official subdomain as a brand lookalike", () => {
    const result = analyzeURL("https://accounts.google.com");
    expect(
      result.brands.find((brand) => brand.brand === "Google")?.isOfficialDomain,
    ).toBe(true);
    expect(
      result.evidence.some((item) => item.type === "brand-similarity"),
    ).toBe(false);
  });

  it.each([
    "https://google.com",
    "https://www.google.com",
    "https://accounts.google.com",
  ])(
    "does not generate brand-similarity evidence for official URL %s",
    (url) => {
      const result = analyzeURL(url);
      expect(
        result.evidence.some((item) => item.type === "brand-similarity"),
      ).toBe(false);
    },
  );

  it("retains generic lookalike evidence without a configured-domain exception", () => {
    const result = analyzeURL("https://gooogle.com");
    expect(
      result.evidence.some((item) => item.type === "brand-similarity"),
    ).toBe(true);
  });

  it.each([
    "https://example.com",
    "https://example.net",
    "https://example.org",
    "https://localhost",
  ])("does not treat reserved host %s as a brand", (url) => {
    const result = analyzeURL(url);
    expect(result.brands).toHaveLength(0);
    expect(
      result.evidence.some((item) => item.type === "brand-similarity"),
    ).toBe(false);
  });

  it("recognizes a real brand lookalike under a reserved test domain", () => {
    const result = analyzeURL("https://paypal-login.example.net");
    expect(result.brands.some((brand) => brand.brand === "PayPal")).toBe(true);
    expect(
      result.evidence.some((item) => item.type === "brand-similarity"),
    ).toBe(true);
  });

  it("retains generic lookalike and homoglyph evidence for unrelated domains", () => {
    const result = analyzeURL("https://gооgle-security-login.example");
    expect(result.homoglyph.detected).toBe(true);
    expect(result.evidence.some((item) => item.type === "homoglyph")).toBe(
      true,
    );
  });

  it("handles legacy login paths with no automatic phishing verdict", () => {
    const result = analyzeURL("https://example.com/login");
    expect(result.valid).toBe(true);
    expect(result.keywords.authentication).toContain("login");
    expect(result.evidence.some((item) => item.type === "credential")).toBe(
      false,
    );
  });

  it("detects private IP URLs without marking them malicious", () => {
    const result = analyzeURL("http://192.168.1.1/login");
    expect(result.valid).toBe(true);
    expect(result.normalized.isIPAddress).toBe(true);
    expect(result.normalized.isIPv4).toBe(true);
    expect(result.features.hasIpAddress).toBe(true);
  });

  it("correctly parses credentials and preserves actual hostname", () => {
    const result = analyzeURL("https://user:pass@example.com");
    expect(result.valid).toBe(true);
    expect(result.normalized.hasCredentials).toBe(true);
    expect(result.normalized.username).toBe("user");
    expect(result.normalized.hostname).toBe("example.com");
  });

  it("detects @ authority attacks while preserving the real host", () => {
    const result = analyzeURL("https://google.com@evil.example");
    expect(result.valid).toBe(true);
    expect(result.normalized.hostname).toBe("evil.example");
    expect(result.normalized.username).toBe("google.com");
    expect(result.evidence.some((item) => item.type === "credential")).toBe(
      true,
    );
  });

  it("handles punycode and IDN hostnames", () => {
    const punycodeResult = analyzeURL("https://xn--bcher-kva.example");
    expect(punycodeResult.valid).toBe(true);
    expect(punycodeResult.unicode.isPunycode).toBe(true);

    const unicodeResult = analyzeURL("https://bücher.example");
    expect(unicodeResult.valid).toBe(true);
    expect(unicodeResult.unicode.containsUnicode).toBe(true);
  });

  it("captures long URLs and deep subdomains", () => {
    const longUrl =
      "https://a.a.a.a.a.example.com/very/long/path/?token=abc123&session=def456&redirect=https://example.com";
    const result = analyzeURL(longUrl);
    expect(result.valid).toBe(true);
    expect(result.normalized.subdomains.length).toBeGreaterThan(1);
    expect(result.features.urlLength).toBeGreaterThan(100);
  });

  it("handles encoded URLs and query-heavy strings", () => {
    const result = analyzeURL(
      "https://example.com/%E2%9C%93?a=1&b=2&c=3&d=4#section",
    );
    expect(result.valid).toBe(true);
    expect(result.normalized.pathname).toContain("%E2%9C%93");
    expect(result.features.questionMarkCount).toBe(1);
    expect(result.features.ampersandCount).toBeGreaterThan(0);
  });

  it("keeps explicit ports and IPv6 addresses", () => {
    const portResult = analyzeURL("https://example.com:8443/login");
    expect(portResult.valid).toBe(true);
    expect(portResult.normalized.port).toBe(8443);

    const ipv6Result = analyzeURL("https://[2001:db8::1]:443/path");
    expect(ipv6Result.valid).toBe(true);
    expect(ipv6Result.normalized.isIPv6).toBe(true);
  });

  it("detects malformed URLs as invalid without crashing", () => {
    const result = analyzeURL("https://exa mple.com");
    expect(result.valid).toBe(false);
    expect(result.normalized.original).toBe("https://exa mple.com");
  });

  it("returns structured keyword and brand evidence without final phishing verdicts", () => {
    const result = analyzeURL("https://secure-brand.example/login");
    expect(result.valid).toBe(true);
    expect(result.keywords.security.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.brands).toBeDefined();
  });

  it("does not emit empty generic-information explanations", () => {
    const result = analyzeURL("https://example.org");
    expect(
      result.evidence.some((item) =>
        item.description.endsWith("indicators: ."),
      ),
    ).toBe(false);
  });
});


describe("URL normalization regression cases", () => {
  it("does not classify an out-of-range IPv4 address as a valid IP", async () => {
    const { normalizeURL } = await import("../src/services/url/normalizer.js");
    const result = normalizeURL("http://999.999.999.999/");
    expect(result.isIPv4).toBe(false);
    expect(result.isIPAddress).toBe(false);
  });

  it("does not silently remove whitespace from a hostname", async () => {
    const { normalizeURL } = await import("../src/services/url/normalizer.js");
    const result = normalizeURL("https://exa mple.com");
    expect(result.hostname).not.toBe("example.com");
  });

  it("continues to recognize a valid private IPv4 address", async () => {
    const { normalizeURL } = await import("../src/services/url/normalizer.js");
    const result = normalizeURL("http://192.168.1.1/");
    expect(result.isIPv4).toBe(true);
    expect(result.isIPAddress).toBe(true);
  });
});
