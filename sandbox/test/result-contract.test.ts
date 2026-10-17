import { describe, expect, it } from "vitest";
import type { SandboxResult } from "../src/types.js";

function assertContract(result: SandboxResult) {
  expect(["available", "unavailable", "timeout", "blocked", "error"]).toContain(result.status);
  expect(Array.isArray(result.redirects)).toBe(true);
  expect(Array.isArray(result.domainsContacted)).toBe(true);
  expect(Array.isArray(result.networkRequests)).toBe(true);
  expect(Array.isArray(result.downloads)).toBe(true);
  expect(Array.isArray(result.screenshots)).toBe(true);
  expect(Array.isArray(result.behaviorObservations)).toBe(true);
}

describe("sandbox result contract", () => {
  it("matches the existing SandboxAnalyzer shape while carrying operational metadata", () => {
    const result: SandboxResult = {
      status: "blocked",
      redirects: [{ url: "https://public.test", status: 302, location: "http://127.0.0.1" }],
      domainsContacted: ["public.test"],
      networkRequests: [{ method: "GET", url: "https://public.test", resourceType: "document", status: 302 }],
      downloads: [],
      screenshots: [],
      behaviorObservations: [{ type: "sandbox_request_blocked", severity: "context", title: "Blocked", description: "Blocked private redirect", source: "sandbox" }],
      durationMs: 10,
      terminationReason: "destination_blocked",
      limitsReached: [],
    };
    assertContract(result);
  });
});
