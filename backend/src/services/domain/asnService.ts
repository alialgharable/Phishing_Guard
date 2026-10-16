import { ASNInfo, ASNServiceOptions } from "./types";

interface ASNResponse {
  asn?: unknown;
  org?: unknown;
  organization?: unknown;
  country?: unknown;
}

export class ASNService {
  private readonly fetcher: typeof fetch;
  private readonly endpoint: string;

  constructor(options: ASNServiceOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.endpoint = options.endpoint ?? "https://ipapi.co";
  }

  public async lookup(ip: string): Promise<ASNInfo> {
    const source = `${this.endpoint.replace(/\/$/, "")}/${encodeURIComponent(ip)}/json/`;
    const response = await this.fetcher(source, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new Error(`ASN request failed with status ${response.status}`);
    const payload = (await response.json()) as ASNResponse;
    const rawAsn = payload.asn;
    const asn =
      typeof rawAsn === "number"
        ? rawAsn
        : typeof rawAsn === "string"
          ? Number.parseInt(rawAsn.replace(/^AS/i, ""), 10)
          : null;
    return {
      asn: Number.isNaN(asn) ? null : asn,
      organization:
        typeof payload.org === "string"
          ? payload.org
          : typeof payload.organization === "string"
            ? payload.organization
            : null,
      country: typeof payload.country === "string" ? payload.country : null,
      source,
      ip,
    };
  }
}
