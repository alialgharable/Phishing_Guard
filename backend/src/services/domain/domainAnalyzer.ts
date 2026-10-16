import { getDomain } from "tldts";
import { Evidence } from "../url/types";
import { ASNService } from "./asnService";
import { DomainCache } from "./domainCache";
import { DNSService, emptyDNSAnalysis } from "./dnsService";
import { RDAPService } from "./rdapService";
import { ReputationService } from "./reputationService";
import { DomainAnalysisResult, DomainServiceError } from "./types";

export interface DomainAnalyzerOptions {
  rdap?: RDAPService;
  dns?: DNSService;
  asn?: ASNService;
  reputation?: ReputationService;
  cache?: DomainCache;
}

export class DomainAnalyzer {
  private readonly rdap: RDAPService;
  private readonly dns: DNSService;
  private readonly asn: ASNService;
  private readonly reputation: ReputationService;
  private readonly cache: DomainCache;

  constructor(options: DomainAnalyzerOptions = {}) {
    this.rdap = options.rdap ?? new RDAPService();
    this.dns = options.dns ?? new DNSService();
    this.asn = options.asn ?? new ASNService();
    this.reputation = options.reputation ?? new ReputationService();
    this.cache = options.cache ?? new DomainCache();
  }

  public async analyze(domain: string): Promise<DomainAnalysisResult> {
    const normalized = domain.trim().toLowerCase().replace(/\.$/, "");
    const registrable = getDomain(normalized);
    if (
      !registrable ||
      (normalized !== registrable && !normalized.endsWith(`.${registrable}`))
    ) {
      return {
        domain: normalized,
        valid: false,
        age: null,
        registration: null,
        dns: emptyDNSAnalysis(),
        asn: null,
        reputation: null,
        evidence: [],
        errors: [
          {
            service: "validation",
            message: "Input is not a valid domain name.",
            retryable: false,
          },
        ],
      };
    }
    const cached = this.cache.get(normalized);
    if (cached) return cached;

    const errors: DomainServiceError[] = [];
    const evidence: Evidence[] = [];
    const [rdapResult, dnsResult, reputationResult] = await Promise.all([
      this.rdap.lookup(registrable).catch((error) => {
        errors.push({
          service: "rdap",
          message: errorMessage(error),
          retryable: true,
        });
        return null;
      }),
      this.dns.analyze(normalized).catch((error) => {
        errors.push({
          service: "dns",
          message: errorMessage(error),
          retryable: true,
        });
        return null;
      }),
      this.reputation.lookup(registrable).catch((error) => {
        errors.push({
          service: "reputation",
          message: errorMessage(error),
          retryable: true,
        });
        return null;
      }),
    ]);
    const dns = dnsResult ?? emptyDNSAnalysis();
    evidence.push(...this.dns.toEvidence(dns));
    if (
      rdapResult?.age?.domainAgeDays !== null &&
      rdapResult?.age?.domainAgeDays !== undefined &&
      rdapResult.age.domainAgeDays < 30
    ) {
      evidence.push({
        type: "domain-age",
        severity: "low",
        title: "Domain was registered recently",
        description:
          "Recent registration is contextual evidence only and does not indicate maliciousness by itself.",
        source: "rdap-service",
      });
    }
    if (rdapResult?.registration?.registrar)
      evidence.push({
        type: "registration",
        severity: "info",
        title: "Registrar information available",
        description:
          "The registrar is descriptive registration metadata, not a maliciousness signal.",
        source: "rdap-service",
      });
    if (reputationResult?.listed === true)
      evidence.push({
        type: "domain-reputation",
        severity: "high",
        title: "Domain reputation provider reported a listing",
        description:
          "A configured domain reputation source reported this domain; this is evidence for later fusion.",
        source: reputationResult.provider,
      });

    let asn = null;
    const firstAddress = dns.a[0] ?? dns.aaaa[0];
    if (firstAddress) {
      asn = await this.asn.lookup(firstAddress).catch((error) => {
        errors.push({
          service: "asn",
          message: errorMessage(error),
          retryable: true,
        });
        return null;
      });
    }
    const result: DomainAnalysisResult = {
      domain: normalized,
      valid: true,
      age: rdapResult?.age ?? null,
      registration: rdapResult?.registration ?? null,
      dns,
      asn,
      reputation: reputationResult,
      evidence,
      errors,
    };
    this.cache.set(normalized, result);
    return result;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown domain intelligence error";
}
