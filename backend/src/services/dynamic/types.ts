import type { Evidence } from "../url/types";

// ---------------------------------------------------------------------------
// DynamicEvidence → Evidence adapter
// DynamicEvidence is the internal type used throughout phases A–D.
// toStaticEvidence() converts it into the existing Evidence type so it can
// flow through EvidenceFusionService without any changes to that service.
// ---------------------------------------------------------------------------

export type EvidenceGroupDynamic =
  | "behavioral"
  | "exfiltration"
  | "visual"
  | "infrastructure";

export interface DynamicEvidence {
  id: string;
  group: EvidenceGroupDynamic;
  /** Raw score BEFORE the per-group cap is applied. */
  score: number;
  description: string;
  /** Near-proof; overrides the independent-category requirement in fuseAll(). */
  hard?: boolean;
  data?: Record<string, unknown>;
}

/** Convert a DynamicEvidence to the static Evidence shape expected by EvidenceFusionService. */
export function toStaticEvidence(d: DynamicEvidence): Evidence {
  const severity: Evidence["severity"] =
    d.score >= 35
      ? "high"
      : d.score >= 18
        ? "medium"
        : d.score >= 8
          ? "low"
          : "info";
  return {
    type: d.id,
    severity,
    title: d.description.slice(0, 120),
    description: d.description,
    source: `dynamic-${d.group}`,
    // Carry the raw score through so the fusion adapter can use it directly.
    strength: d.hard
      ? "critical"
      : severity === "high"
        ? "high"
        : severity === "medium"
          ? "medium"
          : severity === "low"
            ? "low"
            : "info",
    confidence: null,
  };
}

// ---------------------------------------------------------------------------
// Detonation types
// ---------------------------------------------------------------------------

export interface ApiEvent {
  api: string;
  t: number;
  gesture: boolean;
  stack: string;
  detail?: Record<string, unknown>;
}

export interface CapturedRequest {
  url: string;
  method: string;
  resourceType: string;
  postData: string | null;
  t: number;
  frameUrl: string;
}

export interface DownloadInfo {
  suggestedName: string;
  sha256: string;
  bytes: number;
}

export interface Canary {
  id: string;
  email: string;
  username: string;
  password: string;
}

export interface DetonationOptions {
  timeoutMs?: number;
  proxy?: { server: string; username?: string; password?: string };
  /** Allow private IPs — only for unit tests, never in production. */
  allowPrivate?: boolean;
  userAgent?: string;
  referer?: string;
  locale?: string;
  mobile?: boolean;
  /** Reserved for offline fixtures; live detonation never types or submits it. */
  submitCanary?: false;
  canary?: Canary;
}

export interface DetonationResult {
  inputUrl: string;
  /** URL of the page where the canary was typed (after initial redirects). */
  landingUrl: string;
  /** URL after submit + follow-up navigation. */
  finalUrl: string;
  title: string;
  html: string;
  screenshot: Buffer | null;
  faviconUrl: string | null;
  faviconBytes: Buffer | null;
  redirectChain: string[];
  requests: CapturedRequest[];
  apiEvents: ApiEvent[];
  downloads: DownloadInfo[];
  scripts: { url: string; body: string }[];
  forms: { action: string; method: string; hasPassword: boolean }[];
  typing: { start: number; end: number; chars: number } | null;
  /** Fake browser-window (Browser-in-the-Browser) heuristic. */
  bitb: boolean;
  submitted: boolean;
  postSubmit: {
    navDomains: string[];
    sameFormReshown: boolean;
    asksOtp: boolean;
  } | null;
  blockedRequests: string[];
  errors: string[];
  durationMs: number;
}
