export type SandboxStatus = "available" | "unavailable" | "timeout" | "blocked" | "error";

export interface EvidenceItem {
  type: string;
  severity: string;
  title: string;
  description: string;
  source: string;
  category?: string;
  group?: string;
  confidence?: number | null;
  occurrenceCount?: number;
  rawEvidence?: unknown[];
}

export interface RedirectObservation {
  url: string;
  status: number;
  location?: string;
}

export interface NetworkRequestObservation {
  method: string;
  url: string;
  domain?: string;
  resourceType: string;
  status?: number;
  contentType?: string;
  contentLength?: number;
  initiator?: string;
  /**
   * "attempted" covers every request the browser started; it becomes "responded" only
   * once a response actually arrived. A request the policy refused therefore stays an
   * attempt with no status, rather than looking like traffic that was served.
   */
  outcome?: "attempted" | "responded";
  /** Why the sandbox refused this request. Records policy, not a verdict about the URL. */
  blockedReason?: string;
}

export interface DownloadObservation {
  filename: string;
  url: string;
  contentType?: string;
  size?: number;
  sha256?: string;
  timestamp: string;
  limitExceeded?: boolean;
}

export interface ScreenshotObservation {
  artifactId: string;
  format: "png";
  width: number;
  height: number;
  bytes: number;
  timestamp: string;
}

export interface SandboxResult {
  status: SandboxStatus;
  finalUrl?: string;
  httpStatus?: number;
  redirects: Array<string | RedirectObservation>;
  domainsContacted: string[];
  networkRequests: Array<string | NetworkRequestObservation>;
  downloads: Array<string | DownloadObservation>;
  screenshots: Array<string | ScreenshotObservation>;
  behaviorObservations: EvidenceItem[];
  message?: string;
  durationMs?: number;
  terminationReason?: string;
  /** Destination the sandbox policy refused, when navigation was blocked. */
  blockedUrl?: string;
  limitsReached?: string[];
}

export interface AnalyzeRequest {
  url: string;
  requestId?: string;
}
