import { describe, expect, it } from "vitest";
import { Evidence } from "../../url/types";
import { assessRisk, EvidenceFusionService } from "../evidenceFusion";

const ev = (overrides: Partial<Evidence> = {}): Evidence => ({
  type: "signal",
  severity: "low",
  title: "Contextual signal",
  description: "Original evidence description",
  source: "test",
  ...overrides,
});

const allAvailable = {
  url: true,
  threatIntel: true,
  domain: true,
  redirects: true,
  content: true,
  brand: true,
  ml: true,
};

function threat(
  category: "phishing" | "malware",
  status: "listed" | "not_listed" | "unavailable" | "error",
) {
  const listed = status === "listed";
  return {
    url: "https://example.test",
    results: [
      {
        provider: "trusted-provider",
        status,
        queried: status === "listed" || status === "not_listed",
        listed,
        category,
        confidence: listed ? 0.99 : null,
        sourceUrl: null,
        firstSeen: null,
        lastSeen: null,
        evidence: [
          ev({
            type: listed ? "threat-intel" : "provider-error",
            severity: listed ? "high" : "medium",
          }),
        ],
        error: status === "error" ? "provider failed" : null,
      },
    ],
    listed,
    knownMalicious: listed,
    providerCount: 1,
    queriedCount: status === "listed" || status === "not_listed" ? 1 : 0,
    providerStatuses: [{ provider: "trusted-provider", status }],
  };
}

describe("EvidenceFusionService policy", () => {
  it("provides a pure service-level analysis-to-assessment boundary", () => {
    expect(new EvidenceFusionService().assess({}).state).toBe("UNKNOWN");
  });
  it("supports known phishing and known malware distinctly", () => {
    expect(
      assessRisk({ threatIntelligence: threat("phishing", "listed") }).state,
    ).toBe("KNOWN_PHISHING");
    expect(
      assessRisk({ threatIntelligence: threat("malware", "listed") }).state,
    ).toBe("KNOWN_MALWARE");
  });

  it("does not treat not-listed, unavailable, or error as malicious evidence", () => {
    for (const status of ["not_listed", "unavailable", "error"] as const) {
      const result = assessRisk({
        threatIntelligence: threat("phishing", status),
      });
      expect(result.state).toBe("UNKNOWN");
      expect(result.score).toBe(0);
      expect(result.directThreatEvidence).toHaveLength(0);
      expect(result.threatIntelligenceStatuses[0].status).toBe(status);
    }
  });

  it("keeps clean content unknown when every threat-intel provider is unavailable", () => {
    const result = assessRisk({
      contentEvidence: [],
      threatIntelligence: {
        ...threat("phishing", "unavailable"),
        providerCount: 3,
        queriedCount: 0,
      },
      availability: { ...allAvailable, threatIntel: false },
    });

    expect(result.state).toBe("UNKNOWN");
    expect(result.uncertainty).toContain(
      "No threat-intelligence provider could be queried",
    );
  });

  it("allows low risk when one threat-intel provider was queried and clean", () => {
    const result = assessRisk({
      contentEvidence: [],
      threatIntelligence: threat("phishing", "not_listed"),
      availability: allAvailable,
    });

    expect(result.state).toBe("LOW_RISK");
  });

  it("does not let repeated brand evidence become independent risk categories", () => {
    const result = assessRisk({
      urlEvidence: [
        ev({
          type: "brand-similarity",
          severity: "low",
          brandName: "PayPal",
        }),
      ],
      brandEvidence: [
        ev({
          type: "brand-domain-mismatch",
          severity: "medium",
          brandName: "PayPal",
        }),
        ev({
          type: "brand-identity",
          severity: "medium",
          brandName: "PayPal",
        }),
      ],
      availability: { ...allAvailable, threatIntel: true },
    });

    expect(result.independentCategoryCount).toBe(1);
    expect(result.state).toBe("UNKNOWN");
    expect(
      result.evidence.filter((item) => item.category === "BRAND"),
    ).toHaveLength(1);
  });

  it("elevates a brand lookalike when credential evidence is also present", () => {
    const result = assessRisk({
      urlEvidence: [
        ev({
          type: "brand-similarity",
          severity: "low",
          brandName: "PayPal",
        }),
      ],
      contentEvidence: [ev({ type: "credential-form", severity: "high" })],
      availability: { ...allAvailable, threatIntel: true },
    });

    expect(result.state).toBe("SUSPICIOUS");
  });

  it("keeps one weak signal unknown and preserves its original evidence", () => {
    const result = assessRisk({ urlEvidence: [ev()] });
    expect(result.state).toBe("UNKNOWN");
    expect(result.evidence[0].description).toBe(
      "Original evidence description",
    );
  });

  it("caps correlated evidence and requires independent categories", () => {
    const correlated = assessRisk({
      contentEvidence: [
        ev({ severity: "high", type: "login-form" }),
        ev({ severity: "high", type: "password-field" }),
        ev({ severity: "high", type: "credential-wording" }),
      ],
    });
    expect(correlated.groups[0].contribution).toBeLessThanOrEqual(35);
    expect(correlated.state).toBe("UNKNOWN");

    const independent = assessRisk({
      urlEvidence: [ev({ severity: "high", type: "suspicious-pattern" })],
      contentEvidence: [
        ev({ severity: "high", type: "credential-collection" }),
      ],
      brandEvidence: [ev({ severity: "high", type: "brand-domain-mismatch" })],
    });
    expect(independent.state).toBe("HIGH_RISK");
    expect(independent.independentCategoryCount).toBe(3);
    expect(independent.strongEvidenceCount).toBe(3);
  });

  it("supports low risk only for a complete explicit clean assessment", () => {
    const result = assessRisk({
      urlEvidence: [ev({ severity: "info", type: "https" })],
      domainEvidence: [ev({ severity: "info", type: "normal-dns" })],
      redirectEvidence: [],
      contentEvidence: [],
      brandEvidence: [],
      threatIntelligence: {
        ...threat("phishing", "not_listed"),
        results: [],
        providerStatuses: [
          { provider: "trusted-provider", status: "not_listed" },
        ],
      },
      availability: allAvailable,
    });
    expect(result.state).toBe("LOW_RISK");
    expect(result.summary).toContain("not a guarantee of safety");
  });

  it("returns UNKNOWN when analysis availability is too limited", () => {
    const result = assessRisk({
      availability: { url: false, threatIntel: false },
    });
    expect(result.state).toBe("UNKNOWN");
    expect(result.uncertainty).toContain(
      "No threat-intelligence provider could be queried",
    );
    expect(result.uncertainty).toContain("Domain analysis unavailable");
  });

  it("does not produce LOW_RISK when a core analysis layer is unavailable", () => {
    const result = assessRisk({
      availability: {
        url: true,
        threatIntel: true,
        domain: true,
        redirects: true,
        content: false,
        brand: true,
        ml: false,
      },
      threatIntelligence: {
        url: "https://example.test",
        results: [],
        listed: false,
        knownMalicious: false,
        providerCount: 1,
        queriedCount: 1,
        providerStatuses: [{ provider: "test", status: "not_listed" }],
      },
    });
    expect(result.state).toBe("UNKNOWN");
    expect(result.uncertainty).toContain("Content analysis unavailable");
  });

  it("tracks ML metadata and prevents ML alone from determining risk", () => {
    const elevated = assessRisk({
      ml: {
        probability: 0.99,
        modelVersion: "phase9.1",
        calibrationMethod: "sigmoid",
      },
    });
    expect(elevated.state).toBe("UNKNOWN");
    expect(elevated.ml).toEqual({
      available: true,
      probability: 0.99,
      modelVersion: "phase9.1",
      calibrationMethod: "sigmoid",
    });

    const unavailable = assessRisk({ availability: { ml: false } });
    expect(unavailable.ml.available).toBe(false);
    expect(unavailable.uncertainty).toContain("ML unavailable");
  });

  it("preserves contradictory observations and explains the result", () => {
    const result = assessRisk({
      threatIntelligence: threat("phishing", "not_listed"),
      domainEvidence: [ev({ severity: "info", type: "normal-domain" })],
      contentEvidence: [
        ev({ severity: "high", type: "credential-collection" }),
      ],
      brandEvidence: [ev({ severity: "high", type: "brand-domain-mismatch" })],
      ml: {
        probability: 0.9,
        modelVersion: "phase9.1",
        calibrationMethod: "isotonic",
      },
    });
    expect(result.state).toBe("HIGH_RISK");
    expect(result.evidence.some((item) => item.type === "normal-domain")).toBe(
      true,
    );
    expect(
      result.evidence.some((item) => item.type === "credential-collection"),
    ).toBe(true);
    expect(result.threatIntelligenceStatuses[0].status).toBe("not_listed");
    expect(result.summary).toContain("Multiple independent");
    expect(result.explanation).toContain("URL analysis unavailable");
  });

  it.each([
    ["https", "URL"],
    ["young-domain", "DOMAIN"],
    ["old-domain", "DOMAIN"],
    ["cloud-hosting", "DOMAIN"],
    ["vps-hosting", "DOMAIN"],
    ["cdn", "DOMAIN"],
    ["unusual-registrar", "DOMAIN"],
    ["unusual-nameserver", "DOMAIN"],
    ["password-field", "CONTENT"],
    ["external-resource", "CONTENT"],
    ["javascript", "CONTENT"],
    ["iframe", "CONTENT"],
    ["brand-similarity", "BRAND"],
    ["url-length", "URL"],
    ["subdomain-count", "URL"],
  ])("does not make %s a phishing verdict by itself", (type, category) => {
    const input =
      category === "URL"
        ? { urlEvidence: [ev({ type })] }
        : category === "DOMAIN"
          ? { domainEvidence: [ev({ type })] }
          : category === "CONTENT"
            ? { contentEvidence: [ev({ type, severity: "high" })] }
            : { brandEvidence: [ev({ type })] };
    const result = assessRisk(input);
    expect(["KNOWN_PHISHING", "KNOWN_MALWARE", "HIGH_RISK"]).not.toContain(
      result.state,
    );
  });

  it("is deterministic", () => {
    const input = {
      urlEvidence: [ev({ severity: "medium" })],
      domainEvidence: [ev({ severity: "medium" })],
    };
    expect(assessRisk(input)).toEqual(assessRisk(input));
  });

  it("does not promote repeated low-strength modern-web observations", () => {
    const result = assessRisk({
      urlEvidence: [ev({ severity: "low", type: "keyword" })],
      domainEvidence: [ev({ severity: "info", type: "cdn" })],
      contentEvidence: Array.from({ length: 100 }, (_, index) =>
        ev({ severity: "low", type: `script-pattern-${index}` }),
      ),
      brandEvidence: [ev({ severity: "info", type: "generic-identity" })],
    });
    expect(result.state).toBe("UNKNOWN");
    expect(
      result.groups.find((group) => group.group === "CONTENT_STRUCTURE")
        ?.contribution,
    ).toBeLessThanOrEqual(35);
  });
});
