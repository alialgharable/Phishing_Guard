import { describe, expect, it } from "vitest";
import { analyzeURL } from "../src/services/url/urlAnalyzer";
import { normalizeURL } from "../src/services/url/normalizer";
import { decodeIDN } from "../src/services/url/unicodeAnalyzer";

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


describe("URL authority, IP, and credential handling regression cases", () => {
  it("does not read an @ outside the authority as embedded credentials", () => {
    for (const url of [
      "https://example.com/?email=a@b.com",
      "https://example.com/inbox#@someone",
      "https://example.com/path/at-sign@",
    ]) {
      const result = normalizeURL(url);
      expect(result.hasCredentials).toBe(false);
      expect(result.username).toBeNull();
      expect(
        analyzeURL(url).evidence.some((item) => item.type === "credential"),
      ).toBe(false);
    }
  });

  it("still reports credentials that are really in the authority", () => {
    expect(normalizeURL("https://user:pass@example.com").hasCredentials).toBe(true);
    expect(normalizeURL("https://google.com@evil.example").hasCredentials).toBe(true);
    expect(normalizeURL("https://google.com@evil.example").hostname).toBe("evil.example");
  });

  it("does not invent a usable URL when parsing fails", () => {
    for (const url of ["http://999.999.999.999/", "https://EXAMPLE.COM:99999/", "http://[::1/x"]) {
      const result = normalizeURL(url);
      expect(result.parseable).toBe(false);
      expect(result.normalized).toBe("");
      // The submitted text must still be preserved for reporting.
      expect(result.original).toBe(url);
      expect(analyzeURL(url).valid).toBe(false);
    }
  });

  it("never advertises a usable URL for a host it could not name", () => {
    // "*" parses under WHATWG but is not a nameable destination; the strict host rule
    // drops it, so normalized must not keep advertising the submitted text as a URL.
    const wildcard = normalizeURL("http://*/x");
    expect(wildcard.hostname).toBe("");
    expect(wildcard.normalized).toBe("");
    expect(analyzeURL("http://*/x").valid).toBe(false);

    // A scoped IPv6 literal is not WHATWG-parseable even though it is a recognisable
    // address form: the host may be reported, the URL may not.
    const scoped = normalizeURL("https://[fe80::1%25eth0]/");
    expect(scoped.parseable).toBe(false);
    expect(scoped.hostname).toBe("fe80::1%25eth0");
    expect(scoped.isIPv6).toBe(true);
    expect(scoped.normalized).toBe("");
    expect(analyzeURL("https://[fe80::1%25eth0]/").valid).toBe(false);

    // The invariant for every rejected input: no normalized URL without a parse.
    for (const url of ["not a url at all", "http://[::1/x", "https://exam ple.com/"]) {
      const result = normalizeURL(url);
      expect(result.parseable ? result.normalized : "").toBe("");
    }
  });

  it("lower-cases hostnames taken from the non-URL fallback path", () => {
    const result = normalizeURL("https://EXAMPLE.COM:99999/");
    expect(result.hostname).toBe(result.hostname.toLowerCase());
    for (const subdomain of result.subdomains) {
      expect(subdomain).toBe(subdomain.toLowerCase());
    }
  });

  it("does not classify a malformed IPv6 literal as an IPv6 address", () => {
    for (const url of ["http://[::1/x", "http://[not-an-ip]/", "http://[1.2.3]/"]) {
      const result = normalizeURL(url);
      expect(result.isIPv6).toBe(false);
      expect(result.isIPAddress).toBe(false);
    }
  });

  it("reports an IPv6 host without its brackets and still flags the address", () => {
    const result = normalizeURL("https://[2001:db8::1]:443/path");
    expect(result.parseable).toBe(true);
    expect(result.hostname).toBe("2001:db8::1");
    expect(result.isIPv6).toBe(true);
    expect(result.isIPAddress).toBe(true);
    expect(result.isIPv4).toBe(false);
    expect(result.registrableDomain).toBeNull();
  });

  it("does not trim a non-ASCII space off the end of a host", () => {
    // String.trim() removes U+00A0, which turns an unmatched host into example.com.
    const result = normalizeURL("https://example.com\u00A0/");
    expect(result.hostname).not.toBe("example.com");
    expect(result.registrableDomain).toBeNull();
    expect(analyzeURL("https://example.com\u00A0/").valid).toBe(false);
  });

  it("rejects an out-of-range port instead of reporting it", () => {
    expect(normalizeURL("https://example.com:8443/").port).toBe(8443);
    expect(normalizeURL("https://EXAMPLE.COM:99999/").port).toBeNull();
    expect(normalizeURL("http://example.com:notanumber/").port).toBeNull();
  });

  it("does not treat digits in an IP literal as homoglyphs", () => {
    for (const url of [
      "http://192.168.1.1/login",
      "http://1.2.3.4.5/",
      "https://10.0.0.1./x",
      "https://[2001:db8::1]/page",
    ]) {
      const result = analyzeURL(url);
      expect(result.homoglyph.detected).toBe(false);
      expect(
        result.evidence.some((item) => item.type === "homoglyph"),
      ).toBe(false);
    }
    // Real IP literals stay valid; a five-part numeric host is not a URL at all.
    expect(analyzeURL("http://192.168.1.1/login").valid).toBe(true);
    expect(analyzeURL("https://10.0.0.1./x").valid).toBe(true);
    expect(analyzeURL("http://1.2.3.4.5/").valid).toBe(false);
  });

  it("accepts an unencoded space in the path without marking the URL invalid", () => {
    const result = analyzeURL("https://example.com/my file.txt");
    expect(result.valid).toBe(true);
    expect(result.normalized.hostname).toBe("example.com");
    expect(result.normalized.pathname).toBe("/my%20file.txt");
  });

  it("still detects a digit substituted into an alphabetic label", () => {
    const result = analyzeURL("https://paypa1.example/login");
    expect(result.homoglyph.detected).toBe(true);
    expect(result.normalized.hostname).toBe("paypa1.example");
  });

  it("decodes punycode hosts through ICU without the deprecated punycode module", () => {
    expect(decodeIDN("xn--bcher-kva.example")).toBe("bücher.example");
    expect(decodeIDN("example.com")).toBe("example.com");
  });

  it("keeps valid URL handling unchanged for common forms", () => {
    const standard = normalizeURL("HTTPS://Example.COM./a/b?x=1#frag");
    expect(standard.parseable).toBe(true);
    expect(standard.protocol).toBe("https");
    expect(standard.hostname).toBe("example.com");
    expect(standard.registrableDomain).toBe("example.com");
    expect(standard.pathname).toBe("/a/b");
    expect(standard.query).toBe("?x=1");
    expect(standard.fragment).toBe("#frag");
    expect(standard.isIPAddress).toBe(false);
    expect(analyzeURL("HTTPS://Example.COM./a/b?x=1#frag").valid).toBe(true);

    const ipv4 = normalizeURL("http://192.168.1.1/login");
    expect(ipv4.isIPv4).toBe(true);
    expect(ipv4.port).toBeNull();

    const unicodeHost = normalizeURL("https://xn--bcher-kva.example");
    expect(unicodeHost.isPunycode).toBe(true);
    expect(unicodeHost.hostname).toBe("xn--bcher-kva.example");

    const whitespaceOnly = normalizeURL("   ");
    expect(whitespaceOnly.parseable).toBe(false);
    expect(whitespaceOnly.hostname).toBe("");
    expect(analyzeURL("").valid).toBe(false);
  });
});
