import { getDomain } from "tldts";
import { ContentAnalysisResult } from "../content/types";
import { analyzeBrandContext } from "./brandContextAnalyzer";
import { defaultBrandProfiles } from "./brandDataset";
import { buildBrandEvidence } from "./brandEvidence";
import { analyzeFavicon } from "./faviconAnalyzer";
import { analyzeIdentity } from "./identityAnalyzer";
import { analyzeLoginContext } from "./loginAnalyzer";
import { matchBrands } from "./brandMatcher";
import { analyzeRelationships } from "./relationshipAnalyzer";
import {
  BrandAnalysisInput,
  BrandAnalysisResult,
  BrandAnalyzerOptions,
} from "./types";

export class BrandAnalyzer {
  private readonly brands;
  private readonly knownThirdPartyDomains: string[];

  constructor(options: BrandAnalyzerOptions = {}) {
    this.brands = options.brands ?? defaultBrandProfiles;
    this.knownThirdPartyDomains = options.knownThirdPartyDomains ?? [];
  }

  public analyze(input: BrandAnalysisInput): BrandAnalysisResult {
    const pageUrl = new URL(input.pageUrl);
    const content = input.content;
    const visibleText = input.visibleText ?? "";
    const headings = input.headings ?? [];
    const metadata = input.metadata ?? [];
    const formText = content.forms.flatMap((form) => [
      form.action ?? "",
      form.method ?? "",
    ]);
    const matches = matchBrands(
      {
        hostname: pageUrl.hostname,
        registrableDomain: getDomain(pageUrl.hostname),
        pathname: pageUrl.pathname,
        title: content.title ?? "",
        visibleText,
        headings,
        metadata,
        formText,
      },
      this.brands,
    );
    const pageIdentity = analyzeIdentity(
      content.title ?? "",
      visibleText,
      headings,
      this.brands,
    );
    const loginContext = analyzeLoginContext(
      content,
      `${content.title ?? ""} ${visibleText} ${headings.join(" ")}`,
    );
    const domainRelationships = analyzeRelationships(
      pageUrl,
      content,
      this.brands,
      this.knownThirdPartyDomains,
    );
    const faviconAnalysis = analyzeFavicon(pageUrl, input.faviconUrl);
    const contextualSignals = analyzeBrandContext(
      matches,
      pageIdentity,
      loginContext,
      `${content.title ?? ""} ${visibleText} ${headings.join(" ")}`,
    );
    const evidence = [
      ...buildBrandEvidence(
        matches,
        pageIdentity,
        loginContext,
        domainRelationships,
      ),
      ...contextualSignals.map((signal) => signal.evidence),
      ...faviconAnalysis.evidence,
    ];
    const mismatchMatches = matches.filter(
      (match) =>
        !match.officialDomains.some((domain) => {
          const current = getDomain(pageUrl.hostname);
          return current === domain || current?.endsWith(`.${domain}`);
        }),
    );
    for (const match of mismatchMatches)
      evidence.push({
        type: "brand-domain-mismatch",
        severity: "medium",
        title: "Brand identity does not match the current domain",
        description: `Content contains references to ${match.brandName}, while ${getDomain(pageUrl.hostname) ?? pageUrl.hostname} is not listed as an official domain.`,
        source: "brand-analysis",
        brandName: match.brandName,
      });
    return {
      matches,
      pageIdentity,
      loginContext,
      domainRelationships,
      faviconAnalysis,
      contextualSignals,
      evidence,
    };
  }
}
