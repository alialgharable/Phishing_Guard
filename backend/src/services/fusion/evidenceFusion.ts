import {
  Evidence,
  EvidenceCategory,
  EvidenceGroup,
  EvidenceStrength,
} from "../url/types";
import { ThreatIntelServiceResult } from "../threatIntel/types";
import { toFusionEvidence } from "./evidenceAdapter";
import {
  AnalysisAvailability,
  DirectThreatEvidence,
  EvidenceCategorySummary,
  EvidenceFusionInput,
  FusionEvidenceItem,
  FusionGroupSummary,
  RiskAssessment,
  RiskState,
} from "./types";

// Bounded policy rules; this is not a universal probability or model score.
const GROUP_CAP = 35;
const HIGH_RISK_SCORE = 70;
const SUSPICIOUS_SCORE = 20;

function appendEvidence(
  target: FusionEvidenceItem[],
  values: Evidence[] | undefined,
  category: EvidenceCategory,
): void {
  for (const value of values ?? [])
    target.push(toFusionEvidence(value, category));
}

function appendBrandEvidence(
  target: FusionEvidenceItem[],
  values: Evidence[] | undefined,
  seenBrands: Set<string>,
): void {
  for (const value of values ?? []) {
    const key = value.brandName?.trim().toLowerCase();
    if (key && seenBrands.has(key)) continue;
    if (key) seenBrands.add(key);
    target.push(toFusionEvidence(value, "BRAND"));
  }
}

function deduplicateItems(items: FusionEvidenceItem[]): FusionEvidenceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const evidence = item.evidence;
    const key = [
      item.category,
      evidence.type,
      evidence.title,
      evidence.description,
      evidence.source,
      evidence.brandName ?? "",
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function threatEvidence(result: ThreatIntelServiceResult | null | undefined): {
  items: FusionEvidenceItem[];
  direct: DirectThreatEvidence[];
} {
  if (!result) return { items: [], direct: [] };
  const items: FusionEvidenceItem[] = [];
  const direct: DirectThreatEvidence[] = [];
  for (const providerResult of result.results) {
    const isListed =
      providerResult.status === "listed" ||
      (providerResult.listed && providerResult.queried);
    const providerItems = providerResult.evidence.map((evidence) => {
      const item = toFusionEvidence(
        {
          ...evidence,
          strength: isListed ? "critical" : "info",
          confidence: providerResult.confidence,
        },
        "THREAT_INTELLIGENCE",
      );
      return {
        ...item,
        directThreat: isListed,
        contribution: isListed ? item.contribution : 0,
      };
    });
    items.push(...providerItems);
    if (isListed) {
      direct.push({
        provider: providerResult.provider,
        category: providerResult.category,
        confidence: providerResult.confidence,
        evidence: providerResult.evidence,
      });
    }
  }
  return { items, direct };
}

function buildGroups(items: FusionEvidenceItem[]): FusionGroupSummary[] {
  const grouped = new Map<EvidenceGroup, FusionEvidenceItem[]>();
  for (const item of items)
    grouped.set(item.group, [...(grouped.get(item.group) ?? []), item]);
  return [...grouped.entries()].map(([group, evidence]) => ({
    group,
    itemCount: evidence.length,
    contributingEvidenceCount: evidence.filter((item) => item.contribution > 0)
      .length,
    contribution: Math.min(
      GROUP_CAP,
      evidence.reduce((sum, item) => sum + item.contribution, 0),
    ),
    evidence,
  }));
}

function strengthRank(strength: EvidenceStrength): number {
  return { info: 0, low: 1, medium: 2, high: 3, critical: 4 }[strength];
}

function buildCategories(
  items: FusionEvidenceItem[],
): EvidenceCategorySummary[] {
  const grouped = new Map<EvidenceCategory, FusionEvidenceItem[]>();
  for (const item of items)
    grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]);
  return [...grouped.entries()].map(([category, evidence]) => ({
    category,
    itemCount: evidence.length,
    contributingEvidenceCount: evidence.filter((item) => item.contribution > 0)
      .length,
    strongestEvidence: evidence.reduce<EvidenceStrength>(
      (strongest, item) =>
        strengthRank(item.strength) > strengthRank(strongest)
          ? item.strength
          : strongest,
      "info",
    ),
    groups: [...new Set(evidence.map((item) => item.group))],
  }));
}

function deriveAvailability(input: EvidenceFusionInput): AnalysisAvailability {
  return {
    url: input.availability?.url ?? input.urlEvidence !== undefined,
    threatIntel:
      input.availability?.threatIntel ??
      Boolean(
        input.threatIntelligence?.providerStatuses?.some(
          ({ status }) => status === "listed" || status === "not_listed",
        ),
      ),
    domain: input.availability?.domain ?? input.domainEvidence !== undefined,
    redirects:
      input.availability?.redirects ?? input.redirectEvidence !== undefined,
    content: input.availability?.content ?? input.contentEvidence !== undefined,
    brand: input.availability?.brand ?? input.brandEvidence !== undefined,
    ml: input.availability?.ml ?? (input.ml !== undefined && input.ml !== null),
    dynamic: input.availability?.dynamic ?? false,
  };
}

function uncertaintyFor(availability: AnalysisAvailability): string[] {
  const labels: Array<[keyof AnalysisAvailability, string]> = [
    ["url", "URL analysis unavailable"],
    ["threatIntel", "No threat-intelligence provider could be queried"],
    ["domain", "Domain analysis unavailable"],
    ["redirects", "Redirect analysis unavailable"],
    ["content", "Content analysis unavailable"],
    ["brand", "Brand analysis unavailable"],
    ["ml", "ML unavailable"],
    ["dynamic", "Dynamic sandbox analysis was not performed"],
  ];
  return labels.filter(([key]) => !availability[key]).map(([, label]) => label);
}

function summaryFor(
  state: RiskState,
  items: FusionEvidenceItem[],
  categories: number,
): string {
  if (state === "KNOWN_PHISHING")
    return "An authoritative provider identified this URL as phishing.";
  if (state === "KNOWN_MALWARE")
    return "An authoritative provider identified this URL as malware.";
  if (state === "HIGH_RISK")
    return `Multiple independent evidence categories support high risk (${categories} categories).`;
  if (state === "SUSPICIOUS")
    return `Meaningful evidence was observed across ${categories} independent categories, but no confirmed threat was established.`;
  if (state === "LOW_RISK")
    return "Available analyses found no elevated malicious indicators; this is not a guarantee of safety.";
  return items.length
    ? "Evidence is incomplete or insufficient for a stronger risk state."
    : "No usable evidence was available for a meaningful assessment.";
}

function chooseState(
  direct: DirectThreatEvidence[],
  score: number,
  independentCategories: number,
  strongEvidenceCount: number,
  mediumOrStrongerEvidenceCount: number,
  nonBrandPositiveEvidenceCount: number,
  availability: AnalysisAvailability,
  positiveEvidenceCount: number,
): RiskState {
  if (direct.some((item) => item.category === "malware"))
    return "KNOWN_MALWARE";
  if (direct.some((item) => item.category === "phishing"))
    return "KNOWN_PHISHING";
  if (
    score >= HIGH_RISK_SCORE &&
    independentCategories >= 2 &&
    strongEvidenceCount >= 2
  )
    return "HIGH_RISK";
  if (
    score >= SUSPICIOUS_SCORE &&
    independentCategories >= 2 &&
    mediumOrStrongerEvidenceCount >= 1 &&
    nonBrandPositiveEvidenceCount > 0
  )
    return "SUSPICIOUS";
  const coreAnalysisAvailable = [
    availability.url,
    availability.threatIntel,
    availability.domain,
    availability.redirects,
    availability.content,
    availability.brand,
  ].every(Boolean);
  const threatIntelClean = availability.threatIntel;
  if (positiveEvidenceCount === 0 && coreAnalysisAvailable && threatIntelClean)
    return "LOW_RISK";
  return "UNKNOWN";
}

export function assessRisk(input: EvidenceFusionInput): RiskAssessment {
  const items: FusionEvidenceItem[] = [];
  const seenBrands = new Set<string>();
  appendBrandEvidence(
    items,
    input.urlEvidence?.filter(
      (evidence) => evidence.type === "brand-similarity",
    ),
    seenBrands,
  );
  appendEvidence(
    items,
    input.urlEvidence?.filter(
      (evidence) => evidence.type !== "brand-similarity",
    ),
    "URL",
  );
  appendEvidence(items, input.domainEvidence, "DOMAIN");
  appendEvidence(items, input.redirectEvidence, "REDIRECT");
  appendEvidence(items, input.contentEvidence, "CONTENT");
  appendBrandEvidence(items, input.brandEvidence, seenBrands);
  const threat = threatEvidence(input.threatIntelligence);
  items.push(...threat.items);

  let ml: RiskAssessment["ml"] = { available: false };
  if (input.ml) {
    if (
      !Number.isFinite(input.ml.probability) ||
      input.ml.probability < 0 ||
      input.ml.probability > 1
    )
      throw new Error("ML probability must be within [0, 1].");
    const strength =
      input.ml.probability >= 0.8
        ? "high"
        : input.ml.probability >= 0.5
          ? "medium"
          : "info";
    ml = {
      available: true,
      probability: input.ml.probability,
      modelVersion: input.ml.modelVersion,
      calibrationMethod: input.ml.calibrationMethod,
    };
    items.push(
      toFusionEvidence(
        {
          type: "ml-probability",
          severity: strength,
          title: "Calibrated model probability",
          description:
            "A calibrated experimental ML probability is one evidence category, not ground truth.",
          source: input.ml.source ?? input.ml.modelName ?? "phase9-calibration",
          strength,
          confidence: input.ml.probability,
        },
        "ML",
      ),
    );
  }

  const deduplicatedItems = deduplicateItems(items);
  const availability = deriveAvailability(input);
  const groups = buildGroups(deduplicatedItems);
  const categories = buildCategories(deduplicatedItems);
  const positive = deduplicatedItems.filter((item) => item.contribution > 0);
  const independentCategories = new Set(positive.map((item) => item.category));
  const strongEvidenceCount = positive.filter(
    (item) => item.strength === "high" || item.strength === "critical",
  ).length;
  const mediumOrStrongerEvidenceCount = positive.filter(
    (item) =>
      item.strength === "medium" ||
      item.strength === "high" ||
      item.strength === "critical",
  ).length;
  const nonBrandPositiveEvidenceCount = positive.filter(
    (item) => item.category !== "BRAND",
  ).length;
  const score = Math.min(
    100,
    groups.reduce((sum, group) => sum + group.contribution, 0),
  );
  const state = chooseState(
    threat.direct,
    score,
    independentCategories.size,
    strongEvidenceCount,
    mediumOrStrongerEvidenceCount,
    nonBrandPositiveEvidenceCount,
    availability,
    positive.length,
  );
  const uncertainty = uncertaintyFor(availability);
  const summary = summaryFor(
    state,
    deduplicatedItems,
    independentCategories.size,
  );
  const systemWarnings = [
    ...(input.threatIntelligence?.providerStatuses ?? [])
      .filter(
        ({ state, status }) =>
          state === "UNAVAILABLE" ||
          state === "ERROR" ||
          status === "unavailable" ||
          status === "error",
      )
      .map(
        ({ provider, message, status }) =>
          `${provider} ${status === "error" ? "returned an error" : "was unavailable"}${message ? `: ${message}` : "."}`,
      ),
    ...(availability.dynamic
      ? []
      : ["Dynamic analysis was not performed; the sandbox is unavailable."]),
  ];
  return {
    state,
    summary,
    score,
    knownThreatIntelligence: threat.direct.length > 0,
    independentCategoryCount: independentCategories.size,
    strongEvidenceCount,
    directThreatEvidence: threat.direct,
    evidence: deduplicatedItems
      .filter(
        (item) => item.category !== "THREAT_INTELLIGENCE" || item.directThreat,
      )
      .map((item) => item.evidence),
    systemWarnings,
    groupedEvidence: deduplicatedItems,
    categories,
    groups,
    explanation: `${summary}${uncertainty.length ? ` Uncertainty: ${uncertainty.join(", ")}.` : ""}`,
    threatIntelligenceStatuses:
      input.threatIntelligence?.providerStatuses ?? [],
    ml,
    availability,
    uncertainty,
  };
}

export class EvidenceFusionService {
  public assess(input: EvidenceFusionInput): RiskAssessment {
    return assessRisk(input);
  }
}
