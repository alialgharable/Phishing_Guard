import { Evidence } from "../url/types";
import {
  ContentAnalysisResult,
  FormAnalysis,
  ResourceAnalysis,
} from "../content/types";

export interface BrandProfile {
  id: string;
  name: string;
  aliases: string[];
  officialDomains: string[];
  keywords: string[];
  knownLoginPaths?: string[];
  categories?: string[];
}

export type BrandMatchType =
  | "exact"
  | "token"
  | "alias"
  | "fuzzy"
  | "domain"
  | "keyword";

export interface BrandMatch {
  brandId: string;
  brandName: string;
  matchedLocations: string[];
  matchType: BrandMatchType;
  similarity: number | null;
  matchedText: string | null;
  officialDomains: string[];
}

export type PageIdentityCategory =
  | "login"
  | "account"
  | "payment"
  | "banking"
  | "email"
  | "social-media"
  | "cloud-storage"
  | "shopping"
  | "cryptocurrency"
  | "generic-information"
  | "unknown";

export interface PageIdentityResult {
  category: PageIdentityCategory;
  indicators: string[];
  brandReferences: string[];
  evidence: Evidence[];
}

export interface LoginContextResult {
  loginOriented: boolean;
  credentialCollection: boolean;
  indicators: string[];
  formCount: number;
  passwordFieldCount: number;
  emailFieldCount: number;
  externalFormCount: number;
  evidence: Evidence[];
}

export type DomainRelationshipType =
  | "same-origin"
  | "same-registrable-domain"
  | "official-brand-domain"
  | "known-third-party"
  | "external"
  | "unknown";

export interface DomainRelationship {
  sourceDomain: string;
  destinationDomain: string;
  relationship: DomainRelationshipType;
  brandId?: string;
  evidence: Evidence[];
}

export interface FaviconAnalysisResult {
  url: string | null;
  domain: string | null;
  sameOrigin: boolean | null;
  external: boolean;
  malformed: boolean;
  evidence: Evidence[];
}

export interface ContextualSignal {
  type: string;
  severity: "info" | "low" | "medium" | "high";
  indicators: string[];
  evidence: Evidence;
}

export interface BrandAnalysisInput {
  pageUrl: string;
  content: ContentAnalysisResult;
  visibleText?: string;
  headings?: string[];
  metadata?: string[];
  faviconUrl?: string | null;
}

export interface BrandAnalysisResult {
  matches: BrandMatch[];
  pageIdentity: PageIdentityResult;
  loginContext: LoginContextResult;
  domainRelationships: DomainRelationship[];
  faviconAnalysis: FaviconAnalysisResult;
  contextualSignals: ContextualSignal[];
  evidence: Evidence[];
}

export interface BrandAnalyzerOptions {
  brands?: BrandProfile[];
  knownThirdPartyDomains?: string[];
}

export interface BrandContextInput {
  pageUrl: URL;
  title: string;
  visibleText: string;
  headings: string[];
  metadata: string[];
  content: ContentAnalysisResult;
}
