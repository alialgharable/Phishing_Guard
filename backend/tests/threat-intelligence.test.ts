import { describe, expect, it, beforeEach } from "vitest";
import { GoogleWebRiskProvider } from "../src/services/threatIntel/providers/googleWebRisk";
import { ThreatIntelService } from "../src/services/threatIntel/threatIntelService";

describe("Threat intelligence providers", () => {
  beforeEach(() => {
    delete process.env.GOOGLE_WEBRISK_API_KEY;
    delete process.env.PHISHTANK_API_KEY;
    delete process.env.URLHAUS_API_URL;
  });

  it("reports Google Web Risk as unavailable when the API key is missing", async () => {
    const provider = new GoogleWebRiskProvider();
    expect(provider.isAvailable()).toBe(false);

    const result = await provider.checkUrl("https://example.com");
    expect(result.queried).toBe(false);
    expect(result.listed).toBe(false);
    expect(result.category).toBe("unknown");
    expect(result.error).toContain("missing");
  });

  it("aggregates provider results without failing when one provider is unavailable", async () => {
    const service = new ThreatIntelService({
      providers: [new GoogleWebRiskProvider()],
    });

    const result = await service.checkUrl("https://example.com");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].queried).toBe(false);
    expect(result.results[0].listed).toBe(false);
    expect(result.knownMalicious).toBe(false);
  });

  it("mark provider errors as failed queries, not as safe URLs", async () => {
    const provider = new GoogleWebRiskProvider();
    const result = await provider.checkUrl("https://example.com");
    expect(result.queried).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.listed).toBe(false);
    expect(result.category).toBe("unknown");
  });
});
