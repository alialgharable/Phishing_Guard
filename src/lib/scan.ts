export const RISK_STATES = [
  "KNOWN_MALWARE",
  "KNOWN_PHISHING",
  "HIGH_RISK",
  "SUSPICIOUS",
  "LOW_RISK",
  "UNKNOWN",
] as const;
export type RiskState = (typeof RISK_STATES)[number];
export type ResourceType =
  | "WEB_PAGE"
  | "API_ENDPOINT"
  | "FILE_DOWNLOAD"
  | "REDIRECT"
  | "UNKNOWN_RESOURCE";
export type ProviderState =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "ERROR"
  | "NO_MATCH"
  | "MATCH";

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
export interface ThreatIntelligenceStatus {
  provider: string;
  status: string;
  state: ProviderState;
  message?: string;
  category?: string;
  confidence?: number | null;
}
export interface SandboxResult {
  status: "available" | "unavailable" | "error";
  finalUrl?: string;
  redirects: string[];
  domainsContacted: string[];
  networkRequests: string[];
  downloads: string[];
  screenshots: string[];
  behaviorObservations: EvidenceItem[];
  message?: string;
}
export interface RiskAssessment {
  state: RiskState;
  summary: string;
  independentCategoryCount: number;
  strongEvidenceCount?: number;
  evidence: EvidenceItem[];
  systemWarnings: string[];
  categories: Array<{ category: string; itemCount: number; contributingEvidenceCount: number }>;
  directThreatEvidence: Array<{ provider: string; category: string; confidence: number | null }>;
  ml: { available: boolean; probability?: number; modelVersion?: string; calibrationMethod?: string };
  availability: Record<string, boolean>;
  uncertainty: string[];
  explanation: string;
  threatIntelligenceStatuses: ThreatIntelligenceStatus[];
}
export interface ScanResponse {
  requestId: string;
  url: string;
  riskAssessment: RiskAssessment;
  resourceType: ResourceType;
  sandbox: SandboxResult;
}

export async function scanUrl(url: string, signal?: AbortSignal): Promise<ScanResponse> {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  const response = await fetch(`${base}/api/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  let payload: (ScanResponse & { message?: string; error?: string }) | undefined;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? `The scan could not be completed (${response.status}).`);
  if (!payload) throw new Error("The analysis service returned an invalid response.");
  return payload;
}
