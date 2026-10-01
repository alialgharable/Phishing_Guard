import { describe, expect, it } from "vitest";
import { RISK_STATES } from "./scan";

describe("dashboard risk-state contract", () => {
  it("supports every backend risk state without converting it to a score", () => {
    expect(RISK_STATES).toEqual([
      "KNOWN_MALWARE",
      "KNOWN_PHISHING",
      "HIGH_RISK",
      "SUSPICIOUS",
      "LOW_RISK",
      "UNKNOWN",
    ]);
  });
});
