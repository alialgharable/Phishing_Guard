import { getDomain } from "tldts";
import { Evidence } from "../url/types";
import { ContentDocumentContext, LinkAnalysis } from "./types";
import {
  findElements,
  getAttribute,
  ParsedNode,
  textContent,
} from "./htmlAnalyzer";

export function analyzeLinks(
  root: ParsedNode,
  context: ContentDocumentContext,
): LinkAnalysis[] {
  return findElements(root, "a").map((link) => {
    const href = getAttribute(link, "href");
    const resolved = href ? resolveUrl(href, context.pageUrl) : null;
    const domain = resolved ? getDomain(resolved.hostname) : null;
    const sameOrigin = resolved ? domain === context.pageDomain : null;
    const external = sameOrigin === false;
    const evidence: Evidence[] = external
      ? [
          {
            type: "external-link",
            severity: "info",
            title: "External link observed",
            description:
              "The page contains a link to another registrable domain.",
            source: "link-analyzer",
          },
        ]
      : [];
    return {
      href: resolved?.toString() ?? href,
      domain,
      sameOrigin,
      external,
      protocol: resolved?.protocol.replace(":", "") ?? null,
      text: textContent(link, context.maxTextLength) || null,
      evidence,
    };
  });
}
function resolveUrl(value: string, base: URL): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}
