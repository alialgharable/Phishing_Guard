import { Evidence } from "../url/types";

export type ThreatIntelCategory =
  | "phishing"
  | "malware"
  | "scam"
  | "spam"
  | "unknown";

export type ThreatIntelStatus =
  | "listed"
  | "not_listed"
  | "not_queried"
  | "unavailable"
  | "error";

export type ThreatIntelProviderState =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "ERROR"
  | "NO_MATCH"
  | "MATCH";

export interface ThreatIntelProvider {
  name: string;
  checkUrl(url: string): Promise<ThreatIntelResult>;
  isAvailable(): boolean;
}

export interface ThreatIntelResult {
  provider: string;
  status?: ThreatIntelStatus;
  queried: boolean;
  listed: boolean;
  category: ThreatIntelCategory;
  confidence: number | null;
  sourceUrl: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  evidence: Evidence[];
  error: string | null;
  providerState?: ThreatIntelProviderState;
}

export interface ThreatIntelServiceResult {
  url: string;
  results: ThreatIntelResult[];
  listed: boolean;
  knownMalicious: boolean;
  providerCount: number;
  queriedCount: number;
  providerStatuses?: Array<{
    provider: string;
    status: ThreatIntelStatus;
    state?: ThreatIntelProviderState;
    message?: string;
  }>;
}
