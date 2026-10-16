import { Evidence } from "../url/types";
import { RedirectFetcher } from "../redirects/redirectFetcher";
import { RedirectPolicy } from "../redirects/redirectPolicy";

export type ResourceType =
  | "WEB_PAGE"
  | "API_ENDPOINT"
  | "FILE_DOWNLOAD"
  | "REDIRECT"
  | "UNKNOWN_RESOURCE";

export interface ContentPolicyConfig {
  maxBytes: number;
  timeoutMs: number;
  maxHtmlNodes: number;
  maxTextLength: number;
}

export interface ContentPolicyOptions {
  config?: Partial<ContentPolicyConfig>;
}

export interface FormAnalysis {
  action: string | null;
  method: string | null;
  sameOrigin: boolean | null;
  actionDomain: string | null;
  inputCount: number;
  passwordInputCount: number;
  emailInputCount: number;
  hiddenInputCount: number;
  hasPasswordField: boolean;
  hasCredentialLikeFields: boolean;
  externalAction: boolean;
  evidence: Evidence[];
}

export interface ScriptAnalysis {
  src: string | null;
  inline: boolean;
  external: boolean;
  domain: string | null;
  sameOrigin: boolean | null;
  contentLength: number | null;
  suspiciousPatterns: string[];
  evidence: Evidence[];
}

export interface LinkAnalysis {
  href: string | null;
  domain: string | null;
  sameOrigin: boolean | null;
  external: boolean;
  protocol: string | null;
  text: string | null;
  evidence: Evidence[];
}

export interface ResourceAnalysis {
  tag: string;
  attribute: string;
  url: string | null;
  domain: string | null;
  sameOrigin: boolean | null;
  external: boolean;
  protocol: string | null;
  evidence: Evidence[];
}

export interface HTMLAnalysis {
  elementCount: number;
  scriptCount: number;
  iframeCount: number;
  formCount: number;
  inputCount: number;
  hiddenElementCount: number;
  externalResourceCount: number;
  inlineStyleCount: number;
  inlineScriptCount: number;
  metaRefreshDetected: boolean;
  titleLength: number;
}

export interface ContentAnalysisError {
  type:
    | "invalid-url"
    | "blocked-destination"
    | "timeout"
    | "response-too-large"
    | "unsupported-content-type"
    | "network"
    | "parse"
    | "policy";
  message: string;
}

export interface ContentAnalysisResult {
  fetched: boolean;
  finalUrl: string | null;
  statusCode: number | null;
  contentType: string | null;
  contentLength: number | null;
  title: string | null;
  language: string | null;
  forms: FormAnalysis[];
  scripts: ScriptAnalysis[];
  links: LinkAnalysis[];
  resources: ResourceAnalysis[];
  html: HTMLAnalysis;
  evidence: Evidence[];
  errors: ContentAnalysisError[];
}

export interface ContentFetchResult {
  response: Response;
  finalUrl: string;
  body: string;
  contentLength: number;
}

export interface ContentFetcherOptions {
  policy?: ContentPolicy;
  redirectPolicy?: RedirectPolicy;
  redirectFetcher?: RedirectFetcher;
  fetcher?: typeof fetch;
}

export interface ContentAnalyzerOptions {
  policy?: ContentPolicy;
  fetcher?: ContentFetcher;
}

export interface ContentDocumentContext {
  pageUrl: URL;
  pageDomain: string | null;
  maxTextLength: number;
}

import type { ContentPolicy } from "./contentPolicy";
import type { ContentFetcher } from "./contentFetcher";
