import {
  Evidence,
  EvidenceCategory,
  EvidenceGroup,
  EvidenceStrength,
} from "../url/types";
import { ThreatIntelServiceResult } from "../threatIntel/types";

export type RiskState =
  | "KNOWN_MALWARE"
  | "KNOWN_PHISHING"
  | "HIGH_RISK"
  | "SUSPICIOUS"
  | "LOW_RISK"
  | "UNKNOWN";

export interface EvidenceCategorySummary {
  category: EvidenceCategory;
  itemCount: number;
  contributingEvidenceCount: number;
  strongestEvidence: EvidenceStrength;
  groups: EvidenceGroup[];
}

export interface DirectThreatEvidence {
  provider: string;
  category: "phishing" | "malware" | "scam" | "spam" | "unknown";
  confidence: number | null;
  evidence: Evidence[];
}

export interface AnalysisAvailability {
  url: boolean;
  threatIntel: boolean;
  domain: boolean;
  redirects: boolean;
  content: boolean;
  brand: boolean;
  ml: boolean;
  dynamic: boolean;
}

export interface FusionEvidenceItem {
  evidence: Evidence;
  category: EvidenceCategory;
  group: EvidenceGroup;
  strength: EvidenceStrength;
  contribution: number;
  directThreat: boolean;
}

export interface MLEvidenceInput {
  probability: number;
  modelName?: string;
  source?: string;
  modelVersion?: string;
  calibrationMethod?: string;
}

export interface EvidenceFusionInput {
  urlEvidence?: Evidence[];
  threatIntelligence?: ThreatIntelServiceResult | null;
  domainEvidence?: Evidence[];
  redirectEvidence?: Evidence[];
  contentEvidence?: Evidence[];
  brandEvidence?: Evidence[];
  ml?: MLEvidenceInput | null;
  availability?: Partial<AnalysisAvailability>;
}

export interface FusionGroupSummary {
  group: EvidenceGroup;
  itemCount: number;
  contributingEvidenceCount: number;
  contribution: number;
  evidence: FusionEvidenceItem[];
}

export interface RiskAssessment {
  state: RiskState;
  summary: string;
  score: number;
  knownThreatIntelligence: boolean;
  independentCategoryCount: number;
  strongEvidenceCount: number;
  directThreatEvidence: DirectThreatEvidence[];
  evidence: Evidence[];
  systemWarnings: string[];
  groupedEvidence: FusionEvidenceItem[];
  categories: EvidenceCategorySummary[];
  groups: FusionGroupSummary[];
  explanation: string;
  threatIntelligenceStatuses: NonNullable<
    ThreatIntelServiceResult["providerStatuses"]
  >;
  ml: {
    available: boolean;
    probability?: number;
    modelVersion?: string;
    calibrationMethod?: string;
  };
  availability: AnalysisAvailability;
  uncertainty: string[];
}
