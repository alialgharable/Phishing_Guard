import { describe, expect, it } from "vitest";
import { extractFeatures } from "../featureExtractor";
import { validateFeatureVector } from "../featureValidator";
import { FeatureAnalysisInput } from "../types";

const emptyInput: FeatureAnalysisInput = {};

describe("feature regression safeguards", () => {
  it("keeps unavailable sources distinct from available zero observations", () => {
    const unavailable = extractFeatures(emptyInput);
    const available = extractFeatures({
      contentAnalysis: {
        fetched: true,
        finalUrl: "https://example.test",
        statusCode: 200,
        contentType: "text/html",
        contentLength: 0,
        title: null,
        language: null,
        forms: [],
        scripts: [],
        links: [],
        resources: [],
        html: {
          elementCount: 0,
          scriptCount: 0,
          iframeCount: 0,
          formCount: 0,
          inputCount: 0,
          hiddenElementCount: 0,
          externalResourceCount: 0,
          inlineStyleCount: 0,
          inlineScriptCount: 0,
          metaRefreshDetected: false,
          titleLength: 0,
        },
        evidence: [],
        errors: [],
      },
    });
    expect(unavailable.sourceAvailability.content).toBe(false);
    expect(unavailable.missing).toContain("form_count");
    expect(available.sourceAvailability.content).toBe(true);
    expect(available.features.form_count).toBe(0);
    expect(available.missing).not.toContain("form_count");
  });

  it("rejects negative counts and out-of-range ratios", () => {
    const vector = extractFeatures(emptyInput);
    vector.features.url_length = -1;
    vector.features.external_resource_ratio = 2;
    const result = validateFeatureVector(vector);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("url_length"))).toBe(
      true,
    );
    expect(
      result.errors.some((error) => error.includes("external_resource_ratio")),
    ).toBe(true);
  });

  it("does not expose labels, scores, or predictions", () => {
    const vector = extractFeatures(emptyInput);
    expect(vector).not.toHaveProperty("classification");
    expect(vector).not.toHaveProperty("riskScore");
    expect(vector).not.toHaveProperty("probability");
    const forbiddenNames = new Set([
      "score",
      "risk_score",
      "phishing_score",
      "confidence_score",
      "prediction",
      "probability",
      "verdict",
      "classification",
    ]);
    expect(
      Object.keys(vector.features).some((name) => forbiddenNames.has(name)),
    ).toBe(false);
  });
});
