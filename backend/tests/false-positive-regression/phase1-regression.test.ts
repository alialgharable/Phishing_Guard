import { describe, expect, it } from "vitest";
import { analyzeURL } from "../../src/services/url/urlAnalyzer";

describe("false positive regression", () => {
  it.each([
    "https://github.com/login",
    "https://example.com/account/signin",
    "https://google.com/security",
    "https://login.microsoftonline.com",
    "https://example.com/verify",
  ])("does not auto-flag legitimate login-oriented URL %s", (url) => {
    const result = analyzeURL(url);
    expect(result.valid).toBe(true);
    expect(result.evidence.some((item) => item.type === "credential")).toBe(
      false,
    );
    expect(result.evidence.some((item) => item.type === "phishing")).toBe(
      false,
    );
  });
});
