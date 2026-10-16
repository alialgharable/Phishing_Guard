import { beforeEach, describe, expect, it, vi } from "vitest";
import { ASNService } from "../src/services/domain/asnService";
import { DomainAnalyzer } from "../src/services/domain/domainAnalyzer";
import { DomainCache } from "../src/services/domain/domainCache";
import { DNSService } from "../src/services/domain/dnsService";
import {
  calculateDomainAge,
  RDAPService,
} from "../src/services/domain/rdapService";
import { ReputationService } from "../src/services/domain/reputationService";
import { DNSAnalysis, RDAPLookupResult } from "../src/services/domain/types";

const dns: DNSAnalysis = {
  a: ["93.184.216.34"],
  aaaa: [],
  mx: ["mail.example.com"],
  ns: ["ns1.example.com"],
  txt: ["v=spf1 -all"],
  spf: ["v=spf1 -all"],
  cname: null,
  hasARecord: true,
  hasAAAARecord: false,
  hasMXRecord: true,
  hasNSRecord: true,
  hasTXTRecord: true,
  signals: ["no-aaaa-record"],
};

describe("domain intelligence", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calculates valid, missing, malformed, and future domain ages safely", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(calculateDomainAge("2025-01-01T00:00:00Z", now).domainAgeDays).toBe(
      365,
    );
    expect(calculateDomainAge(null, now).domainAgeDays).toBeNull();
    expect(calculateDomainAge("not-a-date", now).domainAgeDays).toBeNull();
    expect(
      calculateDomainAge("2027-01-01T00:00:00Z", now).domainAgeDays,
    ).toBeNull();
  });

  it("parses RDAP registration metadata without exposing registrant details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "example.com",
          status: ["active"],
          events: [
            { eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" },
          ],
          entities: [
            {
              roles: ["registrar"],
              vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar"]]],
            },
          ],
          nameservers: [{ ldhName: "NS1.EXAMPLE.COM" }],
        }),
        { status: 200 },
      ),
    );
    const result = await new RDAPService({ fetcher }).lookup("example.com");
    expect(result.registration?.registrar).toBe("Example Registrar");
    expect(result.registration?.nameservers).toEqual(["ns1.example.com"]);
    expect(result.age?.domainAgeDays).not.toBeNull();
  });

  it("collects DNS records and emits contextual signals", async () => {
    const resolver = {
      resolve4: vi.fn().mockResolvedValue(["127.0.0.1"]),
      resolve6: vi.fn().mockResolvedValue([]),
      resolveMx: vi.fn().mockResolvedValue([]),
      resolveNs: vi.fn().mockResolvedValue(["ns.example.com"]),
      resolveTxt: vi.fn().mockResolvedValue([["v=spf1 -all"]]),
      resolveCname: vi.fn().mockResolvedValue([]),
    };
    const result = await new DNSService({ resolver }).analyze("example.com");
    expect(result.a).toEqual(["127.0.0.1"]);
    expect(result.spf).toEqual(["v=spf1 -all"]);
    expect(result.signals).toContain("localhost-resolution");
  });

  it("isolates service failures and does not create a verdict", async () => {
    const rdap: RDAPLookupResult = {
      registration: null,
      age: null,
      sourceUrl: "test://rdap",
    };
    const rdapService = {
      lookup: vi.fn().mockResolvedValue(rdap),
    } as unknown as RDAPService;
    const dnsService = {
      analyze: vi.fn().mockResolvedValue(dns),
      toEvidence: vi.fn().mockReturnValue([]),
    } as unknown as DNSService;
    const asnService = {
      lookup: vi.fn().mockRejectedValue(new Error("ASN unavailable")),
    } as unknown as ASNService;
    const reputationService = {
      lookup: vi.fn().mockResolvedValue(null),
    } as unknown as ReputationService;
    const result = await new DomainAnalyzer({
      rdap: rdapService,
      dns: dnsService,
      asn: asnService,
      reputation: reputationService,
    }).analyze("example.com");
    expect(result.valid).toBe(true);
    expect(result.asn).toBeNull();
    expect(result.errors.some((error) => error.service === "asn")).toBe(true);
    expect(result).not.toHaveProperty("classification");
    expect(result).not.toHaveProperty("riskScore");
  });

  it("does not treat missing reputation configuration as malicious", async () => {
    const service = new ReputationService({ endpoint: undefined });
    expect(service.isAvailable()).toBe(false);
    await expect(service.lookup("example.com")).resolves.toBeNull();
  });

  it("caches domain analysis results with expiry support", () => {
    const cache = new DomainCache();
    const value = {
      domain: "example.com",
      valid: true,
      age: null,
      registration: null,
      dns,
      asn: null,
      reputation: null,
      evidence: [],
      errors: [],
    };
    cache.set("EXAMPLE.COM", value, 60_000);
    expect(cache.get("example.com")).toEqual(value);
    cache.clear();
    expect(cache.get("example.com")).toBeNull();
  });
});
