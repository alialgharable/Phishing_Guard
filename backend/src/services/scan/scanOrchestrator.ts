import {
  EvidenceFusionService,
  EvidenceFusionInput,
  RiskAssessment,
} from "../fusion";
import { BrandAnalyzer } from "../brand/brandAnalyzer";
import { ContentAnalyzer } from "../content/contentAnalyzer";
import { DomainAnalyzer } from "../domain/domainAnalyzer";
import { RedirectAnalyzer } from "../redirects/redirectAnalyzer";
import { ThreatIntelService } from "../threatIntel/threatIntelService";
import { analyzeURL } from "../url/urlAnalyzer";
import { extractFeatures } from "../features/featureExtractor";
import { FeatureVector } from "../features/types";
import { ConnectedSandboxAnalyzer } from "../dynamic/connectedSandboxAnalyzer";
import {
  SandboxAnalysisResult,
  SandboxAnalyzer,
  UnavailableSandboxAnalyzer,
} from "../dynamic/sandboxAnalyzer";

export interface ScanResult {
  url: string;
  normalizedUrl: ReturnType<typeof analyzeURL>["normalized"];
  resourceType: ReturnType<typeof analyzeURL>["resourceType"];
  riskAssessment: RiskAssessment;
  featureVector: FeatureVector;
  analyses: {
    url: ReturnType<typeof analyzeURL>;
    threatIntelligence: Awaited<ReturnType<ThreatIntelService["checkUrl"]>>;
    domain: Awaited<ReturnType<DomainAnalyzer["analyze"]>>;
    redirects: Awaited<ReturnType<RedirectAnalyzer["analyze"]>>;
    content: Awaited<ReturnType<ContentAnalyzer["analyze"]>>;
    brand: ReturnType<BrandAnalyzer["analyze"]>;
    dynamic: SandboxAnalysisResult;
  };
}

export interface ScanDependencies {
  threatIntel?: ThreatIntelService;
  domain?: DomainAnalyzer;
  redirects?: RedirectAnalyzer;
  content?: ContentAnalyzer;
  brand?: BrandAnalyzer;
  fusion?: EvidenceFusionService;
  sandbox?: SandboxAnalyzer;
}

export class ScanOrchestrator {
  private readonly dependencies: Required<ScanDependencies>;
  constructor(dependencies: ScanDependencies = {}) {
    this.dependencies = {
      threatIntel: dependencies.threatIntel ?? new ThreatIntelService(),
      domain: dependencies.domain ?? new DomainAnalyzer(),
      redirects: dependencies.redirects ?? new RedirectAnalyzer(),
      content: dependencies.content ?? new ContentAnalyzer(),
      brand: dependencies.brand ?? new BrandAnalyzer(),
      fusion: dependencies.fusion ?? new EvidenceFusionService(),
      sandbox:
        dependencies.sandbox ??
        (process.env.PHISHGUARD_DYNAMIC_ENABLED === "1"
          ? new ConnectedSandboxAnalyzer()
          : new UnavailableSandboxAnalyzer()),
    };
  }

  public async scan(url: string): Promise<ScanResult> {
    const urlAnalysis = analyzeURL(url);
    const domainName =
      urlAnalysis.normalized.registrableDomain ??
      urlAnalysis.normalized.hostname;
    const [threatIntelligence, domain, redirects, content, dynamic] =
      await Promise.all([
        this.dependencies.threatIntel.checkUrl(url),
        domainName
          ? this.dependencies.domain.analyze(domainName)
          : Promise.reject(new Error("Domain unavailable")),
        this.dependencies.redirects.analyze(url),
        this.dependencies.content.analyze(url),
        this.dependencies.sandbox.analyze(url),
      ]);
    const brand = this.dependencies.brand.analyze({ pageUrl: url, content });
    const featureVector = extractFeatures({
      urlAnalysis,
      threatIntelligence,
      domainIntelligence: domain,
      redirectAnalysis: redirects,
      contentAnalysis: content,
      brandAnalysis: brand,
    });
    const fusionInput: EvidenceFusionInput = {
      urlEvidence: urlAnalysis.evidence,
      threatIntelligence,
      domainEvidence: domain.evidence,
      redirectEvidence: redirects.evidence,
      contentEvidence: content.evidence,
      brandEvidence: brand.evidence,
      availability: {
        url: true,
        threatIntel: threatIntelligence.queriedCount > 0,
        domain: domain.valid,
        redirects: true,
        content: content.fetched,
        brand: true,
        ml: false,
        dynamic: dynamic.status === "available",
      },
    };
    return {
      url,
      normalizedUrl: urlAnalysis.normalized,
      featureVector,
      resourceType: urlAnalysis.resourceType,
      riskAssessment: this.dependencies.fusion.assess(fusionInput),
      analyses: {
        url: urlAnalysis,
        threatIntelligence,
        domain,
        redirects,
        content,
        brand,
        dynamic,
      },
    };
  }
}
