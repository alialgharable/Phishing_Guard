import { describe, expect, it } from "vitest";
import { BrandAnalyzer } from "../brandAnalyzer";
import { defaultBrandProfiles } from "../brandDataset";
import { analyzeFavicon } from "../faviconAnalyzer";
import { matchBrands } from "../brandMatcher";
import { ContentAnalysisResult } from "../../content/types";

function content(
  overrides: Partial<ContentAnalysisResult> = {},
): ContentAnalysisResult {
  return {
    fetched: true,
    finalUrl: "https://examplebank.test/login",
    statusCode: 200,
    contentType: "text/html",
    contentLength: 100,
    title: "Example Bank Login",
    language: "en",
    forms: [
      {
        action: "https://collector.invalid/submit",
        method: "post",
        sameOrigin: false,
        actionDomain: "collector.invalid",
        inputCount: 2,
        passwordInputCount: 1,
        emailInputCount: 1,
        hiddenInputCount: 0,
        hasPasswordField: true,
        hasCredentialLikeFields: true,
        externalAction: true,
        evidence: [],
      },
    ],
    scripts: [],
    links: [],
    resources: [],
    html: {
      elementCount: 8,
      scriptCount: 0,
      iframeCount: 0,
      formCount: 1,
      inputCount: 2,
      hiddenElementCount: 0,
      externalResourceCount: 0,
      inlineStyleCount: 0,
      inlineScriptCount: 0,
      metaRefreshDetected: false,
      titleLength: 18,
    },
    evidence: [],
    errors: [],
    ...overrides,
  };
}

const testBrandProfiles = [
  {
    id: "example-bank",
    name: "Example Bank",
    aliases: ["ExampleBank", "Example Bank Online"],
    officialDomains: ["examplebank.test"],
    keywords: ["example bank", "examplebank", "example banking"],
    knownLoginPaths: ["/login", "/signin"],
    categories: ["banking"],
  },
];

describe("Phase 6 advanced brand analysis", () => {
  it("supports official domains, aliases, multiple domains, and normalized matching", () => {
    const profile = {
      id: "multi",
      name: "Multi Brand",
      aliases: ["MultiBrand"],
      officialDomains: ["multi.test", "multi.example.test"],
      keywords: ["multi brand"],
    };
    const matches = matchBrands(
      {
        hostname: "portal.multi.example.test",
        registrableDomain: "multi.example.test",
        pathname: "/login",
        title: "MultiBrand Sign In",
        visibleText: "",
        headings: [],
        metadata: [],
        formText: [],
      },
      [profile],
    );
    expect(matches[0].brandId).toBe("multi");
    expect(matches[0].matchedLocations).toContain("registrable-domain");
    expect(matches[0].officialDomains).toContain("multi.test");
  });

  it("treats every configured official domain and subdomain as official", () => {
    const profile = {
      id: "multi-official",
      name: "Multi Official",
      aliases: ["Multi Official"],
      officialDomains: [
        "primary.test",
        "www.primary.test",
        "secondary.test",
        "accounts.secondary.test",
      ],
      keywords: ["multi official"],
    };
    for (const hostname of [
      "primary.test",
      "www.primary.test",
      "accounts.secondary.test",
    ]) {
      const matches = matchBrands(
        {
          hostname,
          registrableDomain: hostname.split(".").slice(-2).join("."),
          pathname: "/",
          title: "",
          visibleText: "",
          headings: [],
          metadata: [],
          formText: [],
        },
        [profile],
      );
      expect(matches[0]?.matchType).toBe("domain");
    }
  });

  it("creates contextual mismatch evidence for a brand login on an unrelated domain", () => {
    const result = new BrandAnalyzer({ brands: testBrandProfiles }).analyze({
      pageUrl: "https://random-site.test/account",
      content: content(),
      visibleText: "Example Bank Account Sign In Verify your account password",
      headings: ["Example Bank Account"],
      faviconUrl: "https://assets.invalid/favicon.ico",
    });
    expect(
      result.matches.some((match) => match.brandId === "example-bank"),
    ).toBe(true);
    expect(result.loginContext.credentialCollection).toBe(true);
    expect(
      result.evidence.some((item) => item.type === "brand-domain-mismatch"),
    ).toBe(true);
    expect(
      result.evidence.some((item) => item.type === "urgent-authentication"),
    ).toBe(false);
    expect(result.faviconAnalysis.external).toBe(true);
  });

  it("protects legitimate article mentions from strong impersonation evidence", () => {
    const articleContent = content({
      title: "Example Bank Security News",
      forms: [],
      html: { ...content().html, formCount: 0 },
    });
    const result = new BrandAnalyzer({ brands: testBrandProfiles }).analyze({
      pageUrl: "https://news.test/article",
      content: articleContent,
      visibleText:
        "Example Bank announced a security update. This article discusses banking news.",
      headings: ["Security News"],
    });
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.loginContext.loginOriented).toBe(false);
    expect(
      result.contextualSignals.some(
        (signal) => signal.type === "brand-credential-context",
      ),
    ).toBe(false);
    expect(
      result.evidence.some((item) => item.type === "brand-domain-mismatch"),
    ).toBe(true);
  });

  it("detects urgency and authentication combinations without a verdict", () => {
    const result = new BrandAnalyzer({ brands: testBrandProfiles }).analyze({
      pageUrl: "https://random-site.test",
      content: content(),
      visibleText:
        "Urgent action required. Your account is suspended. Verify now with your password.",
    });
    expect(
      result.contextualSignals.some(
        (signal) => signal.type === "urgent-authentication",
      ),
    ).toBe(true);
    expect(result).not.toHaveProperty("classification");
    expect(result).not.toHaveProperty("riskScore");
  });

  it("tracks same-origin, external, and official favicon relationships safely", () => {
    const same = analyzeFavicon(
      new URL("https://examplebank.test/login"),
      "/favicon.ico",
    );
    const external = analyzeFavicon(
      new URL("https://examplebank.test/login"),
      "https://cdn.test/favicon.ico",
    );
    const malformed = analyzeFavicon(
      new URL("https://examplebank.test/login"),
      "http://[bad",
    );
    expect(same.sameOrigin).toBe(true);
    expect(external.external).toBe(true);
    expect(malformed.malformed).toBe(true);
  });

  it("keeps the small dataset configurable", () => {
    expect(defaultBrandProfiles.length).toBeLessThan(10);
    expect(
      defaultBrandProfiles.every(
        (profile) => !/^example\b/i.test(profile.name),
      ),
    ).toBe(true);
    expect(
      defaultBrandProfiles.every(
        (profile) => profile.officialDomains.length > 0,
      ),
    ).toBe(true);
  });
});
