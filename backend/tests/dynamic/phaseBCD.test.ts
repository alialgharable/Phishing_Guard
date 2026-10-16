import { describe, expect, it } from "vitest";
import { hamming64 } from "../../src/services/dynamic/visual/hash";
import { domSimhash } from "../../src/services/dynamic/visual/simhash";
import {
  obfuscationEvidence,
  scoreScript,
} from "../../src/services/dynamic/infra/jsObfuscation";
import { classifyExfil } from "../../src/services/dynamic/infra/exfilEndpoints";
import { dynamicFeatures } from "../../src/services/dynamic/ml/dynamicFeatures";
import type { DetonationResult } from "../../src/services/dynamic/types";

const result: DetonationResult = {
  inputUrl: "https://example.test",
  landingUrl: "https://example.test",
  finalUrl: "https://example.test",
  title: "",
  html: "",
  screenshot: null,
  faviconUrl: null,
  faviconBytes: null,
  redirectChain: [],
  requests: [],
  apiEvents: [],
  downloads: [],
  scripts: [],
  forms: [],
  typing: null,
  bitb: false,
  submitted: false,
  postSubmit: null,
  blockedRequests: [],
  errors: [],
  durationMs: 0,
};

describe("dynamic phases B-D passive utilities", () => {
  it("computes deterministic DOM fingerprints", () => {
    const a = domSimhash('<div class="x"><span>one</span></div>');
    expect(hamming64(a, a)).toBe(0);
  });
  it("scores obfuscation indicators without executing scripts", () => {
    const score = scoreScript("eval(atob(a)+atob(b)+atob(c));").score;
    expect(score).toBeGreaterThan(0);
    expect(
      obfuscationEvidence({ html: "<script>var a=1</script>", scripts: [] }),
    ).toEqual([]);
  });
  it("classifies known exfiltration endpoints from captured requests", () => {
    const classified = classifyExfil(
      [
        {
          url: "https://api.telegram.org/bot123:abc/sendMessage",
          method: "POST",
          resourceType: "fetch",
          postData: "x=1",
          t: 1,
          frameUrl: "",
        },
      ],
      "example.test",
    );
    expect(classified.evidence[0].hard).toBe(true);
  });
  it("keeps unavailable dynamic features explicit", () => {
    expect(dynamicFeatures(null, [])).toEqual({ dyn_available: 0 });
    expect(dynamicFeatures(result, []).dyn_cert_age_days).toBeNull();
  });
});
