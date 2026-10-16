import {
  ThreatIntelProvider,
  ThreatIntelResult,
  ThreatIntelServiceResult,
  ThreatIntelStatus,
  ThreatIntelProviderState,
} from "./types";
import { GoogleWebRiskProvider } from "./providers/googleWebRisk";
import { PhishTankProvider } from "./providers/phishTank";
import { URLhausProvider } from "./providers/urlhaus";

export class ThreatIntelService {
  private readonly providers: ThreatIntelProvider[];

  constructor(options?: { providers?: ThreatIntelProvider[] }) {
    this.providers = options?.providers ?? [
      new GoogleWebRiskProvider(),
      new PhishTankProvider(),
      new URLhausProvider(),
    ];
  }

  public getProviders(): ThreatIntelProvider[] {
    return this.providers;
  }

  public async checkUrl(url: string): Promise<ThreatIntelServiceResult> {
    const tasks = this.providers.map(async (provider) => {
      try {
        const result = await provider.checkUrl(url);
        return {
          ...result,
          status: result.status ?? this.inferStatus(provider, result),
        };
      } catch (error) {
        return {
          provider: provider.name,
          status: "error" as const,
          queried: false,
          listed: false,
          category: "unknown",
          confidence: null,
          sourceUrl: null,
          firstSeen: null,
          lastSeen: null,
          evidence: [
            {
              type: "threat-intel-error",
              severity: "medium",
              title: "Threat intelligence provider threw an unexpected error",
              description:
                error instanceof Error
                  ? error.message
                  : "Unknown provider failure",
              source: provider.name,
            },
          ],
          error:
            error instanceof Error ? error.message : "Unknown provider failure",
        } satisfies ThreatIntelResult;
      }
    });

    const results = await Promise.all(tasks);
    const listed = results.some((result) => result.listed);
    const queriedCount = results.filter((result) => result.queried).length;
    const knownMalicious = results.some(
      (result) =>
        result.listed &&
        ["phishing", "malware", "scam", "spam"].includes(result.category),
    );

    return {
      url,
      results,
      listed,
      knownMalicious,
      providerCount: this.providers.length,
      queriedCount,
      providerStatuses: results.map((result) => {
        const status = result.status ?? this.inferStatusByResult(result);
        return {
          provider: result.provider,
          status,
          state: this.stateFor(status),
          ...(result.error ? { message: result.error } : {}),
        };
      }),
    };
  }

  private stateFor(status: ThreatIntelStatus): ThreatIntelProviderState {
    if (status === "listed") return "MATCH";
    if (status === "not_listed") return "NO_MATCH";
    if (status === "error") return "ERROR";
    return "UNAVAILABLE";
  }

  private inferStatus(
    provider: ThreatIntelProvider,
    result: ThreatIntelResult,
  ): ThreatIntelStatus {
    if (!provider.isAvailable() && !result.queried) return "unavailable";
    return this.inferStatusByResult(result);
  }

  private inferStatusByResult(result: ThreatIntelResult): ThreatIntelStatus {
    if (result.listed) return "listed";
    if (result.queried) return "not_listed";
    return result.error ? "error" : "not_queried";
  }
}
