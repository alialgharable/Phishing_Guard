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
        title: "Google Web Risk is unavailable",
        description: message,
        source: providerName,
      } satisfies Evidence,
    ],
    error: message,
  };
}

export class GoogleWebRiskProvider implements ThreatIntelProvider {
  public readonly name = "Google Web Risk";

  public isAvailable(): boolean {
    return Boolean(
      process.env.GOOGLE_WEBRISK_API_KEY &&
      process.env.GOOGLE_WEBRISK_API_KEY.trim(),
    );
  }

  public async checkUrl(url: string): Promise<ThreatIntelResult> {
    const apiKey = process.env.GOOGLE_WEBRISK_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return createUnavailableResult(
        this.name,
        "missing GOOGLE_WEBRISK_API_KEY environment variable.",
      );
    }

    const endpoint = `https://webrisk.googleapis.com/v1/uris:search?key=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uri: url }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        const errorMessage = `Google Web Risk request failed with status ${response.status}: ${responseText || "unknown error"}`;
        return {
          provider: this.name,
          queried: false,
          listed: false,
          category: "unknown",
          confidence: null,
          sourceUrl: endpoint,
          firstSeen: null,
          lastSeen: null,
          evidence: [
            {
              type: "provider-error",
              severity: "medium",
              title: "Google Web Risk returned an HTTP error",
              description: errorMessage,
              source: this.name,
            } satisfies Evidence,
          ],
          error: errorMessage,
        };
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const matches = Array.isArray(payload.matches) ? payload.matches : [];
      const threatTypes = matches
        .map((match) => (match as Record<string, unknown>)?.threatType)
        .filter((match): match is string => typeof match === "string");

      const listed = threatTypes.length > 0;
      const category = listed
        ? threatTypes.some((type) => /malware/i.test(type))
          ? "malware"
          : "phishing"
        : "unknown";

      return {
        provider: this.name,
        queried: true,
        listed,
        category,
        confidence: listed ? 0.95 : null,
        sourceUrl: endpoint,
        firstSeen: null,
        lastSeen: null,
        evidence: [
          {
            type: "threat-intel",
            severity: listed ? "high" : "info",
            title: listed
              ? "Google Web Risk returned a threat hit"
              : "Google Web Risk did not flag the URL",
            description: listed
              ? `Google Web Risk reported one or more threat types: ${threatTypes.join(", ")}`
              : "Google Web Risk did not identify the URL as malicious.",
            source: this.name,
          } satisfies Evidence,
        ],
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown Google Web Risk network error";
      return {
        provider: this.name,
        queried: false,
        listed: false,
        category: "unknown",
        confidence: null,
        sourceUrl: endpoint,
        firstSeen: null,
        lastSeen: null,
        evidence: [
          {
            type: "provider-error",
            severity: "medium",
            title: "Google Web Risk request failed",
            description: message,
            source: this.name,
          } satisfies Evidence,
        ],
        error: message,
      };
    }
  }
}
