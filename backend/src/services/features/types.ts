import { URLAnalysisResult } from "../url/types";
import { ThreatIntelServiceResult } from "../threatIntel/types";
import { DomainAnalysisResult } from "../domain/types";
import { RedirectAnalysisResult } from "../redirects/types";
import { ContentAnalysisResult } from "../content/types";
import { BrandAnalysisResult } from "../brand/types";

export type FeatureType = "numeric" | "boolean" | "categorical";

export interface FeatureDefinition {
  name: string;
  type: FeatureType;
  description: string;
  source: string;
  nullable: boolean;
  version: string;
  min?: number;
  max?: number;
}

export interface FeatureVector {
  version: string;
  features: Record<string, number>;
  categorical: Record<string, string>;
  missing: string[];
  sourceAvailability: Record<string, boolean>;
}

export interface FeatureValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FeatureAnalysisInput {
  urlAnalysis?: URLAnalysisResult | null;
  threatIntelligence?: ThreatIntelServiceResult | null;
  domainIntelligence?: DomainAnalysisResult | null;
  redirectAnalysis?: RedirectAnalysisResult | null;
  contentAnalysis?: ContentAnalysisResult | null;
  brandAnalysis?: BrandAnalysisResult | null;
}
