export const RISK_STATES = [
  "KNOWN_MALWARE",
  "KNOWN_PHISHING",
  "HIGH_RISK",
  "SUSPICIOUS",
  "LOW_RISK",
  "UNKNOWN",
] as const;
export type RiskState = (typeof RISK_STATES)[number];

export interface EvidenceItem {
  type: string;
  severity: string;
  title: string;
  description: string;
  source: string;
  category?: string;
  group?: string;
}

export interface RiskAssessment {
  state: RiskState;
  summary: string;
  independentCategoryCount: number;
  strongEvidenceCount?: number;
  evidence: EvidenceItem[];
  systemWarnings: string[];
  categories: Array<{
    category: string;
    itemCount: number;
    contributingEvidenceCount: number;
  }>;
  directThreatEvidence: Array<{
    provider: string;
    category: string;
    confidence: number | null;
  }>;
  ml: {
    available: boolean;
    probability?: number;
    modelVersion?: string;
    calibrationMethod?: string;
  };
  availability: Record<string, boolean>;
  uncertainty: string[];
  explanation: string;
  threatIntelligenceStatuses: Array<{
    provider: string;
    status: string;
    state?: "AVAILABLE" | "UNAVAILABLE" | "ERROR" | "NO_MATCH" | "MATCH";
    message?: string;
  }>;
}

export interface ScanResponse {
  requestId: string;
  url: string;
  riskAssessment: RiskAssessment;
  resourceType:
    | "WEB_PAGE"
    | "API_ENDPOINT"
    | "FILE_DOWNLOAD"
    | "REDIRECT"
    | "UNKNOWN_RESOURCE";
}

export async function scanUrl(
  url: string,
  signal?: AbortSignal,
): Promise<ScanResponse> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"}/api/scan`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    },
  );
  const payload = (await response.json()) as ScanResponse & {
    message?: string;
    error?: string;
  };
  if (!response.ok)
    throw new Error(
      payload.message ?? payload.error ?? "The scan could not be completed.",
    );
  return payload;
}
