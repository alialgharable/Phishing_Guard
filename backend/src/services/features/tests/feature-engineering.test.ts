import { describe, expect, it } from "vitest";
import { FEATURE_REGISTRY } from "../featureRegistry";
import { extractFeatures } from "../featureExtractor";
import { toFeatureArray, featureVectorToRow } from "../featureSchema";
import { validateFeatureVector } from "../featureValidator";
import { FeatureAnalysisInput } from "../types";

function sampleInput(): FeatureAnalysisInput {
  return {
    urlAnalysis: {
      valid: true,
      normalized: {
        original: "https://random.test/login",
        normalized: "https://random.test/login",
        parseable: true,
        protocol: "https",
        hostname: "random.test",
        registrableDomain: "random.test",
        subdomains: [],
        port: null,
        pathname: "/login",
        query: "",
        fragment: "",
        username: null,
        hasCredentials: false,
        isIPAddress: false,
        isIPv4: false,
        isIPv6: false,
        isPunycode: false,
      },
      features: {
        urlLength: 25,
        hostnameLength: 11,
        pathLength: 6,
        queryLength: 0,
        dotCount: 1,
        hyphenCount: 0,
        underscoreCount: 0,
        slashCount: 3,
        questionMarkCount: 0,
        ampersandCount: 0,
        equalsCount: 0,
        percentCount: 0,
        atSymbolCount: 0,
        digitCount: 0,
        letterCount: 21,
        specialCharacterCount: 4,
        subdomainCount: 0,
        hasIpAddress: false,
        hasPort: false,
        hasCredentials: false,
        hasAtSymbol: false,
        suspiciousKeywordCount: 1,
        authenticationKeywordCount: 1,
        financialKeywordCount: 0,
        urgencyKeywordCount: 0,
        entropy: 3.2,
      },
      unicode: {
        containsUnicode: false,
        isPunycode: false,
        scripts: ["Latin"],
        hasMixedScripts: false,
        suspiciousCharacters: [],
      },
      homoglyph: {
        detected: false,
        original: "random.test",
        normalized: "random.test",
        suspiciousCharacters: [],
      },
      keywords: {
        authentication: ["login"],
        financial: [],
        urgency: [],
        security: [],
      },
      brands: [],
      evidence: [],
      resourceType: "WEB_PAGE",
    },
    threatIntelligence: {
      url: "https://random.test/login",
      results: [
        {
          provider: "Google Web Risk",
          queried: true,
          listed: false,
          category: "unknown",
          confidence: null,
          sourceUrl: null,
          firstSeen: null,
          lastSeen: null,
          evidence: [],
          error: null,
        },
        {
          provider: "URLhaus",
          queried: false,
          listed: false,
          category: "unknown",
          confidence: null,
          sourceUrl: null,
          firstSeen: null,
          lastSeen: null,
          evidence: [],
          error: "unavailable",
        },
      ],
      listed: false,
      knownMalicious: false,
      providerCount: 2,
      queriedCount: 1,
    },
    domainIntelligence: {
      domain: "random.test",
      valid: true,
      age: {
        creationDate: null,
        domainAgeDays: null,
        domainAgeMonths: null,
        domainAgeYears: null,
      },
      registration: null,
      dns: {
        a: [],
        aaaa: [],
        mx: [],
        ns: [],
        txt: [],
        spf: [],
        cname: null,
        hasARecord: false,
        hasAAAARecord: false,
        hasMXRecord: false,
        hasNSRecord: false,
        hasTXTRecord: false,
        signals: [],
      },
      asn: null,
      reputation: null,
      evidence: [],
      errors: [{ service: "rdap", message: "unavailable", retryable: true }],
    },
    redirectAnalysis: {
      originalUrl: "https://random.test",
      finalUrl: "https://random.test/login",
      redirectCount: 1,
      hops: [
        {
          index: 0,
          url: "https://random.test",
          statusCode: 302,
          location: "/login",
          hostname: "random.test",
          protocol: "https",
          durationMs: 3,
          error: null,
        },
        {
          index: 1,
          url: "https://random.test/login",
          statusCode: 200,
          location: null,
          hostname: "random.test",
          protocol: "https",
          durationMs: 2,
          error: null,
        },
      ],
      loopDetected: false,
      maxRedirectsReached: false,
      blockedDestination: false,
      timedOut: false,
      completed: true,
      evidence: [],
      errors: [],
    },
    contentAnalysis: {
      fetched: true,
      finalUrl: "https://random.test/login",
      statusCode: 200,
      contentType: "text/html",
      contentLength: 200,
      title: "Login",
      language: "en",
      forms: [
        {
          action: "/login",
          method: "post",
          sameOrigin: true,
          actionDomain: "random.test",
          inputCount: 2,
          passwordInputCount: 1,
          emailInputCount: 1,
          hiddenInputCount: 0,
          hasPasswordField: true,
          hasCredentialLikeFields: true,
          externalAction: false,
          evidence: [],
        },
      ],
      scripts: [],
      links: [],
      resources: [],
      html: {
        elementCount: 5,
        scriptCount: 0,
        iframeCount: 0,
        formCount: 1,
        inputCount: 2,
        hiddenElementCount: 0,
        externalResourceCount: 0,
        inlineStyleCount: 0,
        inlineScriptCount: 0,
        metaRefreshDetected: false,
        titleLength: 5,
      },
      evidence: [],
      errors: [],
    },
    brandAnalysis: {
      matches: [],
      pageIdentity: {
        category: "login",
        indicators: ["password field"],
        brandReferences: [],
        evidence: [],
      },
      loginContext: {
        loginOriented: true,
        credentialCollection: true,
        indicators: ["password field"],
        formCount: 1,
        passwordFieldCount: 1,
        emailFieldCount: 1,
        externalFormCount: 0,
        evidence: [],
      },
      domainRelationships: [],
      faviconAnalysis: {
        url: null,
        domain: null,
        sameOrigin: null,
        external: false,
        malformed: false,
        evidence: [],
      },
      contextualSignals: [],
      evidence: [],
    },
  };
}

describe("feature engineering", () => {
  it("keeps registry names unique and metadata versioned", () => {
    const names = FEATURE_REGISTRY.map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
    expect(
      FEATURE_REGISTRY.every(
        (definition) =>
          definition.version === "1.0.0" && definition.source.length > 0,
      ),
    ).toBe(true);
  });

  it("is deterministic and uses numeric boolean encoding", () => {
    const first = extractFeatures(sampleInput());
    const second = extractFeatures(sampleInput());
    expect(first).toEqual(second);
    expect(first.features.protocol_is_https).toBe(1);
    expect(first.features.has_credentials).toBe(0);
    expect(first.categorical.page_identity).toBe("login");
  });

  it("distinguishes unknown values from real zeros", () => {
    const vector = extractFeatures(sampleInput());
    expect(vector.features.domain_age_days).toBe(0);
    expect(vector.missing).toContain("domain_age_days");
    expect(vector.missing).toContain("urlhaus_listed");
    expect(vector.features.google_webrisk_queried).toBe(1);
    expect(vector.features.google_webrisk_listed).toBe(0);
  });

  it("bounds ratios and follows registry order for arrays and rows", () => {
    const vector = extractFeatures(sampleInput());
    expect(vector.features.external_resource_ratio).toBeGreaterThanOrEqual(0);
    expect(vector.features.external_resource_ratio).toBeLessThanOrEqual(1);
    expect(toFeatureArray(vector)).toHaveLength(
      FEATURE_REGISTRY.filter((definition) => definition.type !== "categorical")
        .length,
    );
    expect(Object.keys(featureVectorToRow(vector))[0]).toBe(
      FEATURE_REGISTRY.find((definition) => definition.type !== "categorical")
        ?.name,
    );
  });

  it("validates the generated vector and rejects corrupt numeric values", () => {
    const vector = extractFeatures(sampleInput());
    expect(validateFeatureVector(vector).valid).toBe(true);
    vector.features.url_length = Number.NaN;
    expect(validateFeatureVector(vector).valid).toBe(false);
  });
});
