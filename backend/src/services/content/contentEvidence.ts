import { Evidence } from "../url/types";
import { ContentAnalysisResult } from "./types";

export function buildContentEvidence(
  result: ContentAnalysisResult,
): Evidence[] {
  const evidence: Evidence[] = [
    ...result.forms.flatMap((form) => form.evidence),
    ...result.scripts.flatMap((script) => script.evidence),
    ...result.links.flatMap((link) => link.evidence),
    ...result.resources.flatMap((resource) => resource.evidence),
  ];
  if (result.html.metaRefreshDetected)
    evidence.push({
      type: "meta-refresh",
      severity: "low",
      title: "Meta refresh observed",
      description:
        "The page includes a meta refresh instruction; it was recorded without following it.",
      source: "html-analyzer",
    });
  if (result.html.iframeCount > 0)
    evidence.push({
      type: "iframe",
      severity: "info",
      title: "Embedded frame observed",
      description:
        "The page contains an iframe. Embedded content was not fetched or executed.",
      source: "html-analyzer",
    });
  if (result.forms.some((form) => form.hasPasswordField))
    evidence.push({
      type: "password-form",
      severity: "info",
      title: "Password field observed",
      description:
        "Password fields are common on legitimate login pages and are contextual evidence only.",
      source: "form-analyzer",
    });
  return evidence;
}
