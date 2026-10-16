import { getDomain } from "tldts";
import {
  characterNGramSimilarity,
  jaroWinklerSimilarity,
  levenshteinDistance,
  tokenSimilarity,
} from "../url/similarityAnalyzer";
import { BrandMatch, BrandProfile } from "./types";
import {
  isReservedBrandName,
  isReservedDomain,
  normalizeBrandText,
  normalizeDomain,
} from "./brandDataset";

export interface BrandMatcherInput {
  hostname: string;
  registrableDomain: string | null;
  pathname: string;
  title: string;
  visibleText: string;
  headings: string[];
  metadata: string[];
  formText: string[];
}

export function matchBrands(
  input: BrandMatcherInput,
  brands: BrandProfile[],
): BrandMatch[] {
  const locations: Array<[string, string]> = [
    ["hostname", input.hostname],
    ["registrable-domain", input.registrableDomain ?? ""],
    ["path", input.pathname],
    ["title", input.title],
    ["visible-text", input.visibleText],
    ["heading", input.headings.join(" ")],
    ["metadata", input.metadata.join(" ")],
    ["form-label", input.formText.join(" ")],
  ];
  const matches: BrandMatch[] = [];
  for (const brand of brands) {
    if (
      isReservedBrandName(brand.name) ||
      brand.officialDomains.some(isReservedDomain)
    )
      continue;
    const officialDomainMatch = isOfficialBrandDomain(input.hostname, brand);
    const candidates = [brand.name, ...brand.aliases, ...brand.keywords]
      .map(normalizeBrandText)
      .filter(Boolean);
    const matchedLocations: string[] = [];
    let matchedText: string | null = null;
    let bestSimilarity = 0;
    let bestType: BrandMatch["matchType"] = "keyword";
    for (const [location, rawValue] of locations) {
      const value = normalizeBrandText(rawValue);
      if (!value) continue;
      for (const candidate of candidates) {
        const exact = value === candidate;
        const token =
          value.split(" ").includes(candidate) || value.includes(candidate);
        const domain =
          location === "hostname" || location === "registrable-domain";
        const distance =
          1 -
          levenshteinDistance(
            value.replace(/ /g, ""),
            candidate.replace(/ /g, ""),
          ) /
            Math.max(
              value.replace(/ /g, "").length,
              candidate.replace(/ /g, "").length,
              1,
            );
        const similarity = Math.max(
          jaroWinklerSimilarity(value, candidate),
          characterNGramSimilarity(value, candidate),
          tokenSimilarity(value, candidate),
          distance,
        );
        if (exact || token || similarity >= 0.72) {
          matchedLocations.push(location);
          matchedText ??= rawValue.trim().slice(0, 200) || null;
          const type: BrandMatch["matchType"] = exact
            ? domain
              ? "domain"
              : "exact"
            : token
              ? brand.aliases.map(normalizeBrandText).includes(candidate)
                ? "alias"
                : "token"
              : "fuzzy";
          if (similarity >= bestSimilarity) {
            bestSimilarity = similarity;
            bestType = type;
          }
        }
      }
    }
    if (officialDomainMatch) {
      matchedLocations.push("hostname", "registrable-domain");
      matchedText ??= input.hostname;
      bestSimilarity = 1;
      bestType = "domain";
    }
    const uniqueLocations = [...new Set(matchedLocations)];
    if (uniqueLocations.length)
      matches.push({
        brandId: brand.id,
        brandName: brand.name,
        matchedLocations: uniqueLocations,
        matchType: bestType,
        similarity: Number(bestSimilarity.toFixed(4)),
        matchedText,
        officialDomains: brand.officialDomains.map(normalizeDomain),
      });
  }
  return matches.sort(
    (left, right) => (right.similarity ?? 0) - (left.similarity ?? 0),
  );
}

export function isOfficialBrandDomain(
  hostname: string,
  profile: BrandProfile,
): boolean {
  const normalized = hostname.trim().toLowerCase();
  return profile.officialDomains.some((domain) => {
    const official = domain.trim().toLowerCase();
    return normalized === official || normalized.endsWith(`.${official}`);
  });
}

export function domainForUrl(value: string): string | null {
  try {
    return getDomain(new URL(value).hostname);
  } catch {
    return null;
  }
}
