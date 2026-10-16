import type { EvidenceItem, RiskAssessment, ThreatIntelligenceStatus } from "../scan";

export function assess(evidence: EvidenceItem[], statuses: ThreatIntelligenceStatus[], sandboxAvailable: boolean): RiskAssessment {
  const direct = statuses
    .filter((item) => item.state === "MATCH")
    .map((item) => ({
      provider: item.provider,
      category: item.category ?? "malware",
      confidence: item.confidence ?? null,
    }));
  const categories = [...new Set(evidence.filter((item) => item.severity !== "context").map((item) => item.category).filter(Boolean))] as string[];
  const unavailable = statuses.filter((item) => item.state === "UNAVAILABLE");
  const errors = statuses.filter((item) => item.state === "ERROR");
  const checked = statuses.filter((item) => item.state === "MATCH" || item.state === "NO_MATCH");
  const warnings = [...unavailable, ...errors].map((item) => `${item.provider}: ${item.message ?? item.state.toLowerCase()}`);
  const uncertainty: string[] = [];
  if (checked.length === 0) uncertainty.push("No threat-intelligence provider could be queried.");
  else if (unavailable.length || errors.length) uncertainty.push("Some threat-intelligence providers could not be queried.");
  if (!sandboxAvailable) uncertainty.push("Dynamic sandbox analysis was not performed.");
  uncertainty.push("Machine-learning analysis is unavailable.");

  let state: RiskAssessment["state"] = "UNKNOWN";
  if (direct.some((item) => item.category === "phishing")) state = "KNOWN_PHISHING";
  else if (direct.length) state = "KNOWN_MALWARE";
  else if (categories.length >= 2 && evidence.filter((item) => item.severity === "high").length >= 2) state = "HIGH_RISK";
  else if (categories.length >= 2) state = "SUSPICIOUS";

  const explanation = direct.length
    ? "An authoritative threat-intelligence provider returned a direct match. Other signals remain supporting evidence, not a verdict."
    : "The available evidence is insufficient to determine whether this URL is malicious or safe.";
  return {
    state,
    summary: state === "UNKNOWN" ? "Insufficient independent security evidence for a reliable classification." : direct.length ? "A configured threat-intelligence source returned a direct listing." : "Multiple independent contextual signals warrant caution.",
    independentCategoryCount: categories.length,
    strongEvidenceCount: evidence.filter((item) => item.severity === "high").length,
    evidence,
    systemWarnings: warnings,
    categories: categories.map((category) => ({ category, itemCount: evidence.filter((item) => item.category === category).length, contributingEvidenceCount: evidence.filter((item) => item.category === category && item.severity !== "context").length })),
    directThreatEvidence: direct,
    ml: { available: false },
    availability: { url: true, threatIntel: checked.length > 0, content: false, redirects: false, brand: false, ml: false, sandbox: sandboxAvailable },
    uncertainty,
    explanation,
    threatIntelligenceStatuses: statuses,
  };
}
