import { getDomain } from "tldts";
import { FaviconAnalysisResult } from "./types";

export function analyzeFavicon(
  pageUrl: URL,
  faviconUrl: string | null | undefined,
): FaviconAnalysisResult {
  if (!faviconUrl)
    return {
      url: null,
      domain: null,
      sameOrigin: null,
      external: false,
      malformed: false,
      evidence: [],
    };
  try {
    const resolved = new URL(faviconUrl, pageUrl);
    const pageDomain = getDomain(pageUrl.hostname);
    const domain = getDomain(resolved.hostname);
    const sameOrigin =
      pageDomain !== null && domain !== null
        ? pageDomain === domain
        : resolved.origin === pageUrl.origin;
    const external = !sameOrigin;
    return {
      url: resolved.toString(),
      domain,
      sameOrigin,
      external,
      malformed: false,
      evidence: external
        ? [
            {
              type: "external-favicon",
              severity: "low",
              title: "Favicon is hosted on another domain",
              description:
                "Favicon hosting is contextual evidence only; websites commonly use external asset providers.",
              source: "favicon-analyzer",
            },
          ]
        : [],
    };
  } catch {
    return {
      url: faviconUrl,
      domain: null,
      sameOrigin: null,
      external: false,
      malformed: true,
      evidence: [
        {
          type: "malformed-favicon",
          severity: "low",
          title: "Favicon reference is malformed",
          description: "The favicon URL could not be parsed.",
          source: "favicon-analyzer",
        },
      ],
    };
  }
}
