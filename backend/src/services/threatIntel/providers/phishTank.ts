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
        title: "PhishTank is unavailable",
        description: message,
        source: providerName,
      } satisfies Evidence,
    ],
    error: message,
  };
}

export class PhishTankProvider implements ThreatIntelProvider {
  public readonly name = "PhishTank";

  public isAvailable(): boolean {
    return Boolean(
      process.env.PHISHTANK_API_KEY ||
      process.env.PHISHTANK_API_URL ||
      process.env.PHISHTANK_FEED_URL,
    );
  }

  public async checkUrl(url: string): Promise<ThreatIntelResult> {
    const apiKey = process.env.PHISHTANK_API_KEY;
    const apiUrl =
      process.env.PHISHTANK_API_URL ||
      "https://checkurl.phishtank.com/checkurl/";

    if (
      !apiKey &&
      !process.env.PHISHTANK_FEED_URL &&
      !process.env.PHISHTANK_API_URL
    ) {
      return createUnavailableResult(
        this.name,
        "missing PhishTank configuration. Set PHISHTANK_API_KEY, PHISHTANK_API_URL, or PHISHTANK_FEED_URL.",
      );
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: new URLSearchParams({ url }).toString(),
      });

      if (!response.ok) {
        const message = `PhishTank request failed with status ${response.status}`;
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
              title: "PhishTank returned an HTTP error",
              description: message,
              source: this.name,
            } satisfies Evidence,
          ],
          error: message,
        };
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const results = (payload.results ?? {}) as Record<string, unknown>;
      const inDatabase = Boolean(
        payload.in_database ??
        payload.inDatabase ??
        results.in_database ??
        results.inDatabase,
      );
      const listed = Boolean(inDatabase);

      return {
        provider: this.name,
        queried: true,
        listed,
        category: listed ? "phishing" : "unknown",
        confidence: listed ? 0.9 : null,
        sourceUrl: apiUrl,
        firstSeen:
          typeof payload.first_seen === "string"
            ? (payload.first_seen as string)
            : null,
        lastSeen:
          typeof payload.last_seen === "string"
            ? (payload.last_seen as string)
            : null,
        evidence: [
          {
            type: "threat-intel",
            severity: listed ? "high" : "info",
            title: listed
              ? "PhishTank reported a known phishing URL"
              : "PhishTank did not report a match",
            description: listed
              ? "PhishTank identified the URL as a known phishing target."
              : "PhishTank did not identify the URL as a known phishing target.",
            source: this.name,
          } satisfies Evidence,
        ],
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown PhishTank network error";
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
            title: "PhishTank request failed",
            description: message,
            source: this.name,
          } satisfies Evidence,
        ],
        error: message,
      };
    }
  }
}
