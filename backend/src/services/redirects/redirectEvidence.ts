import { Evidence } from "../url/types";
import { RedirectAnalysisResult } from "./types";

export function buildRedirectEvidence(
  result: RedirectAnalysisResult,
): Evidence[] {
  const evidence: Evidence[] = [];
  if (result.redirectCount > 0)
    evidence.push({
      type: "redirect-chain",
      severity: "info",
      title: "Redirect chain observed",
      description: `The URL traversed ${result.redirectCount} redirect(s). Redirect presence alone is not malicious evidence.`,
      source: "redirect-analyzer",
    });
  if (result.loopDetected)
    evidence.push({
      type: "redirect-loop",
      severity: "medium",
      title: "Redirect loop detected",
      description:
        "The redirect chain revisited a URL and could not safely continue.",
      source: "redirect-analyzer",
    });
  if (result.maxRedirectsReached)
    evidence.push({
      type: "redirect-limit",
      severity: "low",
      title: "Redirect limit reached",
      description: "Analysis stopped at the configured redirect limit.",
      source: "redirect-policy",
    });
  if (result.blockedDestination)
    evidence.push({
      type: "blocked-destination",
      severity: "medium",
      title: "Redirect destination was blocked",
      description:
        "The redirect policy blocked a local, private, internal, credential-bearing, or unsupported destination.",
      source: "redirect-policy",
    });
  if (result.timedOut)
    evidence.push({
      type: "redirect-timeout",
      severity: "low",
      title: "Redirect request timed out",
      description:
        "The request exceeded the configured timeout and was aborted.",
      source: "redirect-fetcher",
    });
  return evidence;
}
