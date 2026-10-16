import { ReputationInfo, ReputationServiceOptions } from "./types";

export class ReputationService {
  private readonly fetcher: typeof fetch;
  private readonly endpoint: string | null;
  private readonly provider: string;

  constructor(options: ReputationServiceOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.endpoint =
      options.endpoint ?? process.env.DOMAIN_REPUTATION_API_URL ?? null;
    this.provider =
      options.provider ??
      process.env.DOMAIN_REPUTATION_PROVIDER ??
      "configured-domain-reputation";
  }

  public isAvailable(): boolean {
    return Boolean(this.endpoint);
  }

  public async lookup(domain: string): Promise<ReputationInfo | null> {
    if (!this.endpoint) return null;
    const sourceUrl = `${this.endpoint.replace(/\/$/, "")}?domain=${encodeURIComponent(domain)}`;
    const response = await this.fetcher(sourceUrl, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new Error(
        `Domain reputation request failed with status ${response.status}`,
      );
    const payload = (await response.json()) as Record<string, unknown>;
    return {
      provider: this.provider,
      listed: typeof payload.listed === "boolean" ? payload.listed : null,
      category: typeof payload.category === "string" ? payload.category : null,
      sourceUrl,
      details: typeof payload.details === "string" ? payload.details : null,
    };
  }
}
