export interface NormalizedURL {
  original: string;
  normalized: string;
  protocol: string;
  hostname: string;
  registrableDomain: string | null;
  subdomains: string[];
  port: number | null;
  pathname: string;
  query: string;
  fragment: string;
  username: string | null;
  hasCredentials: boolean;
  isIPAddress: boolean;
  isIPv4: boolean;
  isIPv6: boolean;
  isPunycode: boolean;
}

export interface URLFeatures {
  urlLength: number;
  hostnameLength: number;
  pathLength: number;
  queryLength: number;

  dotCount: number;
  hyphenCount: number;
  underscoreCount: number;
  slashCount: number;
  questionMarkCount: number;
  ampersandCount: number;
  equalsCount: number;
  percentCount: number;
  atSymbolCount: number;

  digitCount: number;
  letterCount: number;
  specialCharacterCount: number;

  subdomainCount: number;

  hasIpAddress: boolean;
  hasPort: boolean;
  hasCredentials: boolean;
  hasAtSymbol: boolean;

  suspiciousKeywordCount: number;
  authenticationKeywordCount: number;
  financialKeywordCount: number;
  urgencyKeywordCount: number;

  entropy: number;
}

export interface KeywordAnalysis {
  authentication: string[];
  financial: string[];
  urgency: string[];
  security: string[];
}

export interface UnicodeAnalysis {
  containsUnicode: boolean;
  isPunycode: boolean;
  scripts: string[];
  hasMixedScripts: boolean;
  suspiciousCharacters: string[];
}

export interface HomoglyphResult {
  detected: boolean;
  original: string;
  normalized: string;
  suspiciousCharacters: string[];
}

export interface BrandMatch {
  brand: string;
  officialDomain: string;
  submittedDomain: string;
  similarity: number;
  matched: boolean;
  isOfficialDomain?: boolean;
  matchType?: "official-domain" | "lookalike" | "contextual";
}

export interface Evidence {
  type: string;
  severity: "info" | "low" | "medium" | "high";
  title: string;
  description: string;
  source: string;
  category?: EvidenceCategory;
  group?: EvidenceGroup;
  strength?: EvidenceStrength;
  confidence?: number | null;
  brandName?: string;
}

export type EvidenceCategory =
  | "URL"
  | "THREAT_INTELLIGENCE"
  | "DOMAIN"
  | "REDIRECT"
  | "CONTENT"
  | "BRAND"
  | "ML";

export type EvidenceGroup =
  | "URL_STRUCTURE"
  | "DOMAIN"
  | "THREAT_INTEL"
  | "REDIRECT"
  | "CONTENT_STRUCTURE"
  | "CREDENTIAL_COLLECTION"
  | "BRAND_IDENTITY"
  | "SOCIAL_ENGINEERING"
  | "MALWARE"
  | "ML";

export type EvidenceStrength = "info" | "low" | "medium" | "high" | "critical";

export interface URLAnalysisResult {
  valid: boolean;
  normalized: NormalizedURL;
  features: URLFeatures;
  unicode: UnicodeAnalysis;
  homoglyph: HomoglyphResult;
  keywords: KeywordAnalysis;
  brands: BrandMatch[];
  evidence: Evidence[];
  resourceType: ResourceType;
}

export type ResourceType =
  | "WEB_PAGE"
  | "API_ENDPOINT"
  | "FILE_DOWNLOAD"
  | "REDIRECT"
  | "UNKNOWN_RESOURCE";

export interface BrandDefinition {
  name: string;
  domains: string[];
  aliases: string[];
}

export interface ParsedURLInfo {
  scheme: string | null;
  hostname: string | null;
  registrableDomain: string | null;
  subdomain: string | null;
  port: number | null;
  path: string;
  query: string;
  fragment: string;
  username: string | null;
}
