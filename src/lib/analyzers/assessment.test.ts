import { describe, expect, it } from "vitest";
import { assess } from "./assessment";

describe("conservative assessment", () => {
  it("does not count unavailable providers as evidence or safety", () => {
    const result = assess([], [{ provider: "Provider", status: "unavailable", state: "UNAVAILABLE" }], false);
    expect(result.state).toBe("UNKNOWN");
    expect(result.evidence).toHaveLength(0);
    expect(result.independentCategoryCount).toBe(0);
    expect(result.systemWarnings).toHaveLength(1);
  });
  it("uses a direct provider match as authoritative evidence", () => {
    const result = assess([], [{ provider: "Provider", status: "match", state: "MATCH", category: "phishing", message: "phishing match" }], false);
    expect(result.state).toBe("KNOWN_PHISHING");
    expect(result.directThreatEvidence).toHaveLength(1);
  });
});
