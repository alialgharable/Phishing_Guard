import { Evidence } from "../../url/types";
import { ThreatIntelProvider, ThreatIntelResult } from "../types";

function createUnavailableResult(
  providerName: string,
  message: string,
): ThreatIntelResult {
  return {
    provider: providerName,
    queried: false,
    listed: false,
    category: "unknown",
    confidence: null,
    sourceUrl: null,
    firstSeen: null,
    lastSeen: null,
    evidence: [
      {
        type: "provider-unavailable",
        severity: "info",
        title: "URLhaus is unavailable",
        description: message,
        source: providerName,
      } satisfies Evidence,
    ],
    error: message,
  };
}

export class URLhausProvider implements ThreatIntelProvider {
  public readonly name = "URLhaus";

  public isAvailable(): boolean {
    return Boolean(process.env.URLHAUS_API_URL || process.env.URLHAUS_API_KEY);
  }

  public async checkUrl(url: string): Promise<ThreatIntelResult> {
    const apiUrl =
      process.env.URLHAUS_API_URL || "https://urlhaus-api.abuse.ch/v1/url/";

    if (!process.env.URLHAUS_API_URL && !process.env.URLHAUS_API_KEY) {
      return createUnavailableResult(
        this.name,
        "missing URLhaus configuration. Set URLHAUS_API_URL or URLHAUS_API_KEY.",
      );
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(process.env.URLHAUS_API_KEY
            ? { Authorization: `Bearer ${process.env.URLHAUS_API_KEY}` }
            : {}),
        },
        body: new URLSearchParams({ url }).toString(),
      });

      if (!response.ok) {
        const message = `URLhaus request failed with status ${response.status}`;
        return {
          provider: this.name,
          queried: false,
          listed: false,
          category: "unknown",
          confidence: null,
          sourceUrl: apiUrl,
          firstSeen: null,
          lastSeen: null,
          evidence: [
            {
              type: "provider-error",
              severity: "medium",
              title: "URLhaus returned an HTTP error",
              description: message,
              source: this.name,
            } satisfies Evidence,
          ],
          error: message,
        };
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const queryStatus = String(
        payload.query_status ?? payload.queryStatus ?? "",
      );
      const isListed = queryStatus === "ok" || queryStatus === "blacklisted";
      const threatType =
        typeof payload.threat === "string" ? payload.threat : "unknown";
      const category = isListed
        ? threatType.toLowerCase().includes("malware")
          ? "malware"
          : "phishing"
        : "unknown";

      return {
        provider: this.name,
        queried: true,
        listed: isListed,
        category,
        confidence: isListed ? 0.88 : null,
        sourceUrl: apiUrl,
        firstSeen:
          typeof payload.firstseen === "string"
            ? (payload.firstseen as string)
            : null,
        lastSeen:
          typeof payload.last_seen === "string"
            ? (payload.last_seen as string)
            : null,
        evidence: [
          {
            type: "threat-intel",
            severity: isListed ? "high" : "info",
            title: isListed
              ? "URLhaus reported a malicious URL"
              : "URLhaus did not report a match",
            description: isListed
              ? `URLhaus reported the URL as ${threatType}.`
              : "URLhaus did not report the URL as malicious or blocked.",
            source: this.name,
          } satisfies Evidence,
        ],
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown URLhaus network error";
      return {
        provider: this.name,
        queried: false,
        listed: false,
        category: "unknown",
        confidence: null,
        sourceUrl: apiUrl,
        firstSeen: null,
        lastSeen: null,
        evidence: [
          {
            type: "provider-error",
            severity: "medium",
            title: "URLhaus request failed",
            description: message,
            source: this.name,
          } satisfies Evidence,
        ],
        error: message,
      };
    }
  }
}
