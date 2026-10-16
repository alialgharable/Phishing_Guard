import { getDomain } from "tldts";
import { Evidence } from "../url/types";
import { ContentDocumentContext, ResourceAnalysis } from "./types";
import { findElements, getAttribute, ParsedNode } from "./htmlAnalyzer";

const RESOURCE_ATTRIBUTES: Array<[string, string]> = [
  ["img", "src"],
  ["script", "src"],
  ["iframe", "src"],
  ["link", "href"],
  ["object", "data"],
  ["embed", "src"],
  ["video", "src"],
  ["audio", "src"],
  ["source", "src"],
];

export function analyzeResources(
  root: ParsedNode,
  context: ContentDocumentContext,
): ResourceAnalysis[] {
  const resources: ResourceAnalysis[] = [];
  for (const [tag, attribute] of RESOURCE_ATTRIBUTES) {
    for (const node of findElements(root, tag)) {
      const raw = getAttribute(node, attribute);
      const resolved = raw ? resolveUrl(raw, context.pageUrl) : null;
      const domain = resolved ? getDomain(resolved.hostname) : null;
      const sameOrigin = resolved ? domain === context.pageDomain : null;
      const external = sameOrigin === false;
      const evidence: Evidence[] = external
        ? [
            {
              type: "external-resource",
              severity: "info",
              title: "External resource observed",
              description:
                "The page references a resource on another registrable domain.",
              source: "resource-analyzer",
            },
          ]
        : [];
      resources.push({
        tag,
        attribute,
        url: resolved?.toString() ?? raw,
        domain,
        sameOrigin,
        external,
        protocol: resolved?.protocol.replace(":", "") ?? null,
        evidence,
      });
    }
  }
  return resources;
}
function resolveUrl(value: string, base: URL): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}
