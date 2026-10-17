import { describe, expect, it } from "vitest";
import { assess } from "../analyzers/assessment";
import { canonicalHostname, MAX_URL_INPUT_LENGTH, normalizeUrl, urlAnalysisEvidence } from "./normalizer";
import { observeCharacters } from "./unicodeAnalyzer";

const codes = (input: unknown) => normalizeUrl(input).blockingIssues.map((item) => item.code);
const ambiguous = (input: string) => normalizeUrl(input).ambiguousIssues.map((item) => item.code);
const context = (input: string) => normalizeUrl(input).contextIssues.map((item) => item.code);

describe("URL intake rejects input it would have to rewrite quietly", () => {
  it("does not let a newline inside the host resolve to a different domain", () => {
    // The WHATWG parser deletes tab and newline everywhere, so this used to be
    // analyzed as https://example.com/ with no trace of the original text.
    expect(codes("http://exa\nmple.com/")).toContain("FORBIDDEN_CONTROL_CHARACTER");
    expect(normalizeUrl("http://example.com\n.evil.com/").status).toBe("rejected");
  });

  it("does not accept a NUL-prefixed URL", () => {
    expect(codes("\u0000http://example.com/")).toContain("FORBIDDEN_CONTROL_CHARACTER");
  });

  it("does not let IDNA delete a zero-width character out of the host", () => {
    // new URL("https://pay\u200Bpal.com/") yields paypal.com: a hidden character
    // turns an unregistered string into a famous domain.
    expect(observeCharacters("pay\u200Bpal.com")[0]).toMatchObject({ codePoint: "U+200B", category: "invisible" });
    expect(codes("https://pay\u200Bpal.com/")).toContain("INVISIBLE_HOST_CHARACTER");
    expect(codes("http://example.com\u200B./")).toContain("INVISIBLE_HOST_CHARACTER");
  });

  it("does not trim non-standard spaces the way String.trim() would", () => {
    expect(codes("http://example.com\u00A0/")).toContain("AMBIGUOUS_WHITESPACE");
    expect(codes(" https://example.com/" + String.fromCharCode(0x00a0))).toContain("AMBIGUOUS_WHITESPACE");
    expect(codes("http://exam\u2000ple.com/")).toContain("AMBIGUOUS_WHITESPACE");
  });

  it("reports bidi formatting characters by category", () => {
    expect(observeCharacters("a\u202Eb")).toEqual([
      { codePoint: "U+202E", label: "RIGHT-TO-LEFT OVERRIDE", category: "bidi", index: 1 },
    ]);
  });

  it("keeps ordinary ASCII space at the edges, which the parser also strips", () => {
    expect(normalizeUrl("  https://example.com/  ").status).toBe("ok");
    expect(normalizeUrl("  https://example.com/  ").href).toBe("https://example.com/");
  });

  it("rejects oversized input instead of truncating it", () => {
    const long = `https://example.com/${"a".repeat(MAX_URL_INPUT_LENGTH)}`;
    expect(codes(long)).toContain("INPUT_TOO_LONG");
  });

  it("rejects non-string, empty and unparseable input", () => {
    expect(codes(null)).toContain("INPUT_NOT_A_STRING");
    expect(codes(undefined)).toContain("INPUT_NOT_A_STRING");
    expect(codes({ url: "https://example.com" })).toContain("INPUT_NOT_A_STRING");
    expect(codes("")).toContain("INPUT_EMPTY");
    expect(codes("   ")).toContain("INPUT_EMPTY");
    expect(codes("example.com")).toContain("UNPARSEABLE");
    expect(codes("//example.com/path")).toContain("UNPARSEABLE");
    expect(codes("http:///path")).toContain("EMPTY_HOST");
    expect(codes("http:////x")).toContain("EMPTY_HOST");
    // A single slash (or none) makes the parser promote the first path segment to a host.
    expect(codes("http:/path")).toContain("EMPTY_HOST");
    expect(codes("http:nodejs")).toContain("EMPTY_HOST");
    expect(codes("https://exam ple.com/")).toContain("UNPARSEABLE");
  });

  it("rejects every scheme that is not HTTP(S) with a specific reason", () => {
    expect(normalizeUrl("file:///etc/passwd").blockingIssues[0]?.message).toContain("FILE");
    expect(normalizeUrl("ftp://example.com/").blockingIssues[0]?.code).toBe("UNSUPPORTED_SCHEME");
    expect(codes("javascript:alert(1)")).toContain("UNSUPPORTED_SCHEME");
  });
});

describe("URL normalization is recorded, never used as a verdict", () => {
  it("flags credentials and keeps them out of anything sent upstream", () => {
    const analysis = normalizeUrl("https://evil.com@good.com/");
    expect(analysis.status).toBe("ok");
    expect(analysis.hostname).toBe("good.com");
    expect(analysis.canonicalHostname).toBe("good.com");
    expect(ambiguous("https://evil.com@good.com/")).toContain("CREDENTIALS_PRESENT");
    // The credential text is still visible to the caller in href, but never forwarded.
    expect(analysis.href).toContain("evil.com@good.com");
    expect(analysis.lookupHref).toBe("https://good.com/");
    expect(analysis.input).toBe("https://evil.com@good.com/");
  });

  it("strips a password too and preserves the submitted string verbatim", () => {
    const raw = "http://user:secretpassword@example.com/login";
    const analysis = normalizeUrl(raw);
    expect(analysis.lookupHref).toBe("http://example.com/login");
    expect(analysis.input).toBe(raw);
    expect(ambiguous(raw)).toContain("CREDENTIALS_PRESENT");
  });

  it("reports a host the parser rewrote into another address", () => {
    const numeric = normalizeUrl("http://2130706433/");
    expect(numeric.status).toBe("ok");
    expect(numeric.canonicalHostname).toBe("127.0.0.1");
    expect(ambiguous("http://2130706433/")).toContain("HOST_REWRITTEN_BY_PARSER");
    expect(ambiguous("http://127.0.0.1%2e/")).toContain("HOST_REWRITTEN_BY_PARSER");
    expect(ambiguous("http://0x7f.0.0.1/")).toContain("HOST_REWRITTEN_BY_PARSER");
  });

  it("reports full stop look-alikes that move host boundaries", () => {
    const analysis = normalizeUrl("https://paypal\u3002com.evil.test/");
    expect(analysis.canonicalHostname).toBe("paypal.com.evil.test");
    expect(analysis.unicode.fullStopLookalikes).toEqual(["U+3002"]);
    expect(ambiguous("https://paypal\u3002com.evil.test/")).toContain("HOST_REWRITTEN_BY_PARSER");
    expect(ambiguous("https://paypal\u3002com.evil.test/")).toContain("UNICODE_HOST");
  });

  it("keeps the Unicode and punycode forms of an internationalized host", () => {
    const analysis = normalizeUrl("https://рaypal.com/");
    expect(analysis.hostname).toBe("xn--aypal-uye.com");
    expect(analysis.unicode.punycodeLabels).toEqual(["xn--aypal-uye"]);
    expect(analysis.unicode.unicodeHost).toBe("рaypal.com");
    expect(ambiguous("https://рaypal.com/")).toContain("UNICODE_HOST");
    expect(context("https://рaypal.com/")).toContain("PUNYCODE_HOST");
  });

  it("accepts a bare punycode host and decodes it for display", () => {
    const analysis = normalizeUrl("http://xn--9ck.com/");
    expect(analysis.status).toBe("ok");
    expect(analysis.unicode.unicodeHost).toBe("ッ.com");
    expect(context("http://xn--9ck.com/")).toContain("PUNYCODE_HOST");
    expect(ambiguous("http://xn--9ck.com/")).toEqual([]);
  });

  it("canonicalizes the root label dot without hiding it", () => {
    const analysis = normalizeUrl("http://example.com./");
    expect(analysis.hostname).toBe("example.com.");
    expect(analysis.canonicalHostname).toBe("example.com");
    expect(context("http://example.com./")).toContain("TRAILING_DOT_HOST");
    expect(ambiguous("http://example.com./")).toEqual([]);
  });

  it("treats case folding and default ports as cosmetic", () => {
    expect(ambiguous("HTTPS://EXAMPLE.COM./A")).toEqual([]);
    expect(normalizeUrl("HTTPS://EXAMPLE.COM./A").href).toBe("http://example.com./A".replace("http", "https"));
    expect(ambiguous("https://example.com:00443/")).toEqual([]);
    expect(context("http://example.com:8080/")).toContain("EXPLICIT_PORT");
    expect(ambiguous("http://example.com:8080/")).toEqual([]);
  });

  it("flags a backslash that moves the real host away from the visible one", () => {
    // Browsers end the authority at "\", so the host here is the first label, not
    // the last. Reporting the difference is the whole point of the check.
    const analysis = normalizeUrl("https://evil.com\\@good.com/");
    expect(analysis.status).toBe("ok");
    expect(analysis.canonicalHostname).toBe("evil.com");
    expect(ambiguous("https://evil.com\\@good.com/")).toContain("HOST_REWRITTEN_BY_PARSER");
    expect(urlAnalysisEvidence(analysis).length).toBeGreaterThan(0);
  });

  it("handles bracketed IPv6 hosts without inventing rewrites", () => {
    const loopback = normalizeUrl("https://[::1]:8080/");
    expect(loopback.status).toBe("ok");
    expect(loopback.canonicalHostname).toBe("::1");
    expect(ambiguous("https://[::1]:8080/")).toEqual([]);
    expect(context("https://[::1]:8080/")).toContain("EXPLICIT_PORT");

    // These really are rewrites: the parser compressed the address text.
    expect(ambiguous("http://[0:0:0:0:0:0:0:1]/")).toContain("HOST_REWRITTEN_BY_PARSER");
    expect(normalizeUrl("http://[0:0:0:0:0:0:0:1]/").canonicalHostname).toBe("::1");
    expect(normalizeUrl("https://[::ffff:127.0.0.1]/").canonicalHostname).toBe("::ffff:7f00:1");
    expect(ambiguous("https://[::ffff:127.0.0.1]/")).toContain("HOST_REWRITTEN_BY_PARSER");

    // A scoped address is not accepted by the parser at all.
    expect(codes("http://[fe80::1%25eth0]/")).toContain("UNPARSEABLE");
  });

  it("records invisible characters that survive outside the host without blocking", () => {
    const analysis = normalizeUrl("http://example.com/a\u200Bb");
    expect(analysis.status).toBe("ok");
    expect(analysis.href).toBe("http://example.com/a%E2%80%8Bb");
    expect(ambiguous("http://example.com/a\u200Bb")).toContain("INVISIBLE_CHARACTER_PRESERVED");
  });

  it("never turns normalization findings into risk evidence", () => {
    const analysis = normalizeUrl("https://user:pass@2130706433:8443/path?\u2060=1#z");
    const evidence = urlAnalysisEvidence(analysis);
    expect(evidence.length).toBeGreaterThan(0);
    for (const item of evidence) {
      expect(item.severity).toBe("context");
      expect(item.category).toBe("url_normalization");
      // No finding may claim a verdict in either direction.
      expect(item.description.toLowerCase()).not.toMatch(/\bis safe\b|\bnot malicious\b|\bbenign\b/);
    }
    const assessment = assess(evidence, [], true);
    expect(assessment.state).toBe("UNKNOWN");
    expect(assessment.independentCategoryCount).toBe(0);
    expect(assessment.strongEvidenceCount).toBe(0);
  });
});

describe("canonicalHostname", () => {
  it("removes brackets, case and the root label dot", () => {
    expect(canonicalHostname("[::1]")).toBe("::1");
    expect(canonicalHostname("LOCALHOST.")).toBe("localhost");
    expect(canonicalHostname("api.localhost..")).toBe("api.localhost");
    expect(canonicalHostname("")).toBe("");
    expect(canonicalHostname(undefined)).toBe("");
    expect(canonicalHostname("[::ffff:7f00:1]")).toBe("::ffff:7f00:1");
  });
});
