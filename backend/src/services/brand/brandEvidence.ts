import { Evidence } from "../url/types";
import {
  BrandMatch,
  DomainRelationship,
  LoginContextResult,
  PageIdentityResult,
} from "./types";

export function buildBrandEvidence(
  matches: BrandMatch[],
  identity: PageIdentityResult,
  login: LoginContextResult,
  relationships: DomainRelationship[],
): Evidence[] {
  const evidence: Evidence[] = [
    ...identity.evidence,
    ...login.evidence,
    ...relationships.flatMap((relationship) => relationship.evidence),
  ];
  for (const match of matches) {
    if (
      match.matchedLocations.includes("title") ||
      match.matchedLocations.includes("heading")
    )
      evidence.push({
        type: "brand-identity",
        severity: "low",
        title: "Brand identity detected in page identity text",
        description: `${match.brandName} was referenced in title or heading content. Brand mention alone is not an impersonation finding.`,
        source: "brand-analysis",
        brandName: match.brandName,
      });
  }
  return evidence;
}
