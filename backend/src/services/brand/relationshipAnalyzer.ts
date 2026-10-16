import { getDomain } from "tldts";
import { ContentAnalysisResult } from "../content/types";
import { BrandProfile, DomainRelationship } from "./types";
import { isOfficialBrandDomain } from "./brandMatcher";

export function analyzeRelationships(
  pageUrl: URL,
  content: ContentAnalysisResult,
  brands: BrandProfile[],
  knownThirdPartyDomains: string[],
): DomainRelationship[] {
  const sourceDomain = getDomain(pageUrl.hostname) ?? pageUrl.hostname;
  const relationships: DomainRelationship[] = [];
  for (const form of content.forms) {
    if (!form.actionDomain) continue;
    const relationship = classify(
      sourceDomain,
      form.actionDomain,
      brands,
      knownThirdPartyDomains,
    );
    relationships.push({
      sourceDomain,
      destinationDomain: form.actionDomain,
      relationship: relationship.type,
      brandId: relationship.brandId,
      evidence:
        relationship.type === "external"
          ? [
              {
                type: "form-domain-relationship",
                severity: "medium",
                title: "Form destination is an unrelated external domain",
                description:
                  "The form destination is external to the page domain; identity providers and payment services can also use this pattern.",
                source: "relationship-analyzer",
              },
            ]
          : [],
    });
  }
  return relationships;
}

function classify(
  source: string,
  destination: string,
  brands: BrandProfile[],
  thirdParty: string[],
): { type: DomainRelationship["relationship"]; brandId?: string } {
  if (source === destination) return { type: "same-origin" };
  if (source.endsWith(`.${destination}`) || destination.endsWith(`.${source}`))
    return { type: "same-registrable-domain" };
  const brand = brands.find((profile) =>
    isOfficialBrandDomain(destination, profile),
  );
  if (brand) return { type: "official-brand-domain", brandId: brand.id };
  if (thirdParty.includes(destination)) return { type: "known-third-party" };
  return { type: "external" };
}
