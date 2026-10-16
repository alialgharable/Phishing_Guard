import { Evidence } from "../url/types";

export interface RedirectHop {
  index: number;
  url: string;
  statusCode: number | null;
  location: string | null;
  hostname: string | null;
  protocol: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface RedirectError {
  type:
    | "invalid-url"
    | "blocked-destination"
    | "timeout"
    | "response-too-large"
    | "network"
    | "policy"
    | "max-redirects";
  message: string;
  url: string | null;
}

export interface RedirectAnalysisResult {
  originalUrl: string;
  finalUrl: string | null;
  redirectCount: number;
  hops: RedirectHop[];
  loopDetected: boolean;
  maxRedirectsReached: boolean;
  blockedDestination: boolean;
  timedOut: boolean;
  completed: boolean;
  evidence: Evidence[];
  errors: RedirectError[];
}

export interface RedirectPolicyConfig {
  maxHops: number;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface RedirectPolicyOptions {
  resolver?: (hostname: string) => Promise<string[]>;
  config?: Partial<RedirectPolicyConfig>;
}

export interface RedirectFetchResult {
  response: Response;
  durationMs: number;
}

export interface RedirectFetcherOptions {
  policy?: RedirectPolicy;
  fetcher?: typeof fetch;
  consumeBody?: boolean;
}

export interface RedirectAnalyzerOptions {
  fetcher?: RedirectFetcher;
  policy?: RedirectPolicy;
}

export interface RedirectFetcher {
  fetch(url: string): Promise<RedirectFetchResult>;
}

import type { RedirectPolicy } from "./redirectPolicy";
