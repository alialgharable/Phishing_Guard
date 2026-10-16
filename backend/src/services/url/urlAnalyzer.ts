import { detectHomoglyphs, findBrandMatches } from "./similarityAnalyzer";
import { normalizeURL } from "./normalizer";
import { analyzeKeywords, extractURLFeatures } from "./lexicalAnalyzer";
import { analyzeUnicode } from "./unicodeAnalyzer";
import { Evidence, KeywordAnalysis, URLAnalysisResult } from "./types";
import { classifyResourceType } from "./resourceClassifier";

const suspiciousDomainPattern =
  /(?:^|\.)(?:login|signin|sign-in|verify|verification|secure|account|security|billing|update|wallet|payment|support)-[a-z0-9.-]+\.[a-z]{2,}/i;

function buildEvidence(
  hostname: string,
  hasCredentials: boolean,
  hasIpAddress: boolean,
  keywords: KeywordAnalysis,
  brands: ReturnType<typeof findBrandMatches>,
  unicode: ReturnType<typeof analyzeUnicode>,
  homoglyph: ReturnType<typeof detectHomoglyphs>,
  normalizedUrl: ReturnType<typeof normalizeURL>,
): Evidence[] {
  const evidence: Evidence[] = [];

  if (hasCredentials) {
    evidence.push({
      type: "credential",
      severity: "high",
      title: "URL includes embedded credentials",
      description:
        "The URL contains username or password data in the authority component.",
      source: "url-normalizer",
    });
  }

  if (hasIpAddress) {
    evidence.push({
      type: "ip-address",
      severity: "low",
      title: "IP address is used in the hostname",
      description:
        "The URL target is an IP address rather than a conventional domain name.",
      source: "url-normalizer",
    });
  }

  if (
    keywords.authentication.length > 0 ||
    keywords.financial.length > 0 ||
    keywords.urgency.length > 0
  ) {
    evidence.push({
      type: "keyword",
      severity: "low",
      title: "Keyword-based URL cues present",
      description:
        "The URL contains contextual tokens that may be associated with login, financial, or urgency flows.",
      source: "keyword-analyzer",
    });
  }

  if (
    unicode.containsUnicode ||
    unicode.hasMixedScripts ||
    unicode.isPunycode
  ) {
    evidence.push({
      type: "unicode",
      severity: unicode.hasMixedScripts ? "medium" : "low",
      title: "Unicode or IDN characteristics detected",
      description:
        "The hostname contains Unicode, punycode, or mixed-script characteristics that should be reviewed as evidence.",
      source: "unicode-analyzer",
    });
  }

  if (homoglyph.detected) {
    evidence.push({
      type: "homoglyph",
      severity: "medium",
      title: "Possible homoglyph confusion detected",
      description:
        "The domain contains characters that visually resemble other characters and may deserve deeper review.",
      source: "similarity-analyzer",
    });
  }

  for (const brand of brands.filter(
    (candidate) => candidate.matched && !candidate.isOfficialDomain,
  )) {
    evidence.push({
      type: "brand-similarity",
      severity: "low",
      title: "Brand similarity found",
      description: `${brand.brand} was found in a hostname that should be treated as contextual evidence only.`,
      source: "brand-similarity",
      brandName: brand.brand,
    });
  }

  if (hostname && suspiciousDomainPattern.test(hostname)) {
    evidence.push({
      type: "suspicious-pattern",
      severity: "medium",
      title: "Suspicious subdomain pattern observed",
      description:
        "The hostname structure resembles a credential or security-themed impersonation pattern.",
      source: "domain-pattern-analyzer",
    });
  }

  if (normalizedUrl.isPunycode) {
    evidence.push({
      type: "punycode",
      severity: "medium",
      title: "Punycode domain detected",
      description:
        "The hostname contains punycode and should be validated carefully as part of the full detection pipeline.",
      source: "unicode-analyzer",
    });
  }

  return evidence;
}

export function analyzeURL(input: string): URLAnalysisResult {
  const normalized = normalizeURL(input);
  const features = extractURLFeatures(normalized);
  const rawInput = input.trim();
  const keywords = analyzeKeywords(rawInput || normalized.original);
  const unicode = analyzeUnicode(
    rawInput || normalized.hostname || normalized.original,
  );
  const homoglyph = detectHomoglyphs(
    rawInput || normalized.hostname || normalized.original,
  );
  const brands = findBrandMatches(
    normalized.hostname || rawInput || normalized.original,
  );
  const evidence = buildEvidence(
    normalized.hostname,
    normalized.hasCredentials,
    normalized.isIPAddress,
    keywords,
    brands,
    unicode,
    homoglyph,
    normalized,
  );
  let resourceType: URLAnalysisResult["resourceType"] = "UNKNOWN_RESOURCE";
  if (normalized.hostname) {
    try {
      resourceType = classifyResourceType(new URL(normalized.normalized));
    } catch {
      resourceType = "UNKNOWN_RESOURCE";
    }
  }

  return {
    valid: Boolean(normalized.hostname && !/\s/.test(normalized.original)),
    normalized,
    features,
    unicode,
    homoglyph,
    keywords,
    brands,
    evidence,
    resourceType,
  };
}
