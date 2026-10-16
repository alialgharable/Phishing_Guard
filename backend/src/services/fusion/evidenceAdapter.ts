import {
  Evidence,
  EvidenceCategory,
  EvidenceGroup,
  EvidenceStrength,
} from "../url/types";
import { FusionEvidenceItem } from "./types";

const severityWeight: Record<Evidence["severity"], number> = {
  info: 0,
  low: 8,
  medium: 18,
  high: 30,
};

function inferGroup(
  evidence: Evidence,
  category: EvidenceCategory,
): EvidenceGroup {
  if (evidence.group) return evidence.group;
  if (category === "THREAT_INTELLIGENCE") return "THREAT_INTEL";
  if (category === "ML") return "ML";
  if (category === "DOMAIN") return "DOMAIN";
  if (category === "REDIRECT") return "REDIRECT";
  if (category === "BRAND") {
    return /login|credential|password|account/i.test(
      evidence.type + evidence.title,
    )
      ? "BRAND_IDENTITY"
      : "SOCIAL_ENGINEERING";
  }
  if (category === "CONTENT") {
    return /password|credential|login|form|email/i.test(
      evidence.type + evidence.title + evidence.description,
    )
      ? "CREDENTIAL_COLLECTION"
      : "CONTENT_STRUCTURE";
  }
  return "URL_STRUCTURE";
}

function inferStrength(evidence: Evidence): EvidenceStrength {
  if (evidence.strength) return evidence.strength;
  return evidence.severity;
}

export function toFusionEvidence(
  evidence: Evidence,
  category: EvidenceCategory,
): FusionEvidenceItem {
  const strength = inferStrength(evidence);
  const base = severityWeight[evidence.severity];
  const multiplier =
    strength === "critical" || strength === "high"
      ? 1
      : strength === "medium"
        ? 0.75
        : strength === "low"
          ? 0.35
          : 0;
  const group = inferGroup(evidence, category);
  return {
    evidence: {
      ...evidence,
      category,
      group,
      strength,
    },
    category,
    group,
    strength,
    contribution: base * multiplier,
    directThreat: false,
  };
}
