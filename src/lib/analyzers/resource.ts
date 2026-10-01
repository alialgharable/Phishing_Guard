import type { EvidenceItem, ResourceType } from "../scan";

const downloadExtensions = /\.(?:exe|msi|dmg|pkg|deb|rpm|apk|zip|rar|7z|iso|pdf|docm?|xlsm?|pptm?)(?:$|[?#])/i;
const apiHosts = /^(?:api|graph|gateway|hooks?|webhooks?)\./i;
const apiPaths = /\/(?:api|v\d+|graphql|rest|bot[^/]+\/[^/]+)(?:\/|$)/i;

export function classifyResource(url: URL): ResourceType {
  if (downloadExtensions.test(url.pathname)) return "FILE_DOWNLOAD";
  if (apiHosts.test(url.hostname) || apiPaths.test(url.pathname)) return "API_ENDPOINT";
  if (url.protocol === "http:" || url.protocol === "https:") return "WEB_PAGE";
  return "UNKNOWN_RESOURCE";
}

export function resourceEvidence(resourceType: ResourceType): EvidenceItem[] {
  if (resourceType === "WEB_PAGE") return [];
  return [{
    type: "RESOURCE_TYPE",
    category: "resource_context",
    severity: "context",
    title: "Resource classified as " + resourceType.toLowerCase().replaceAll("_", " "),
    description: "This classification provides analysis context and is not evidence of maliciousness.",
    source: "Static resource classifier",
    confidence: null,
  }];
}
