import { DNSAnalysis, DNSServiceOptions } from "./types";
import { Evidence } from "../url/types";

export const emptyDNSAnalysis = (): DNSAnalysis => ({
  a: [],
  aaaa: [],
  mx: [],
  ns: [],
  txt: [],
  spf: [],
  cname: null,
  hasARecord: false,
  hasAAAARecord: false,
  hasMXRecord: false,
  hasNSRecord: false,
  hasTXTRecord: false,
  signals: [],
});

export class DNSService {
  private readonly resolver: NonNullable<DNSServiceOptions["resolver"]>;

  constructor(options: DNSServiceOptions = {}) {
    this.resolver = options.resolver ?? require("node:dns").promises;
  }

  public async analyze(domain: string): Promise<DNSAnalysis> {
    const result = emptyDNSAnalysis();
    const resolve = async <T>(
      operation: () => Promise<T>,
      fallback: T,
    ): Promise<T> => {
      try {
        return await operation();
      } catch {
        return fallback;
      }
    };
    result.a = await resolve(() => this.resolver.resolve4(domain), []);
    result.aaaa = await resolve(() => this.resolver.resolve6(domain), []);
    result.mx = (await resolve(() => this.resolver.resolveMx(domain), [])).map(
      (record) => record.exchange,
    );
    result.ns = await resolve(() => this.resolver.resolveNs(domain), []);
    const txtRecords = await resolve(
      () => this.resolver.resolveTxt(domain),
      [],
    );
    result.txt = txtRecords.map((record) => record.join(""));
    result.spf = result.txt.filter((record) => /^v=spf1(?:\s|$)/i.test(record));
    result.cname =
      (await resolve(() => this.resolver.resolveCname(domain), []))[0] ?? null;
    result.hasARecord = result.a.length > 0;
    result.hasAAAARecord = result.aaaa.length > 0;
    result.hasMXRecord = result.mx.length > 0;
    result.hasNSRecord = result.ns.length > 0;
    result.hasTXTRecord = result.txt.length > 0;
    if (!result.hasARecord) result.signals.push("no-a-record");
    if (!result.hasAAAARecord) result.signals.push("no-aaaa-record");
    if (result.a.length > 8) result.signals.push("many-a-records");
    if (result.ns.length > 8) result.signals.push("many-ns-records");
    if (result.cname && /localhost|127\.0\.0\.1|::1/i.test(result.cname))
      result.signals.push("suspicious-cname");
    if (
      [...result.a, ...result.aaaa].some((address) =>
        /^(127\.|10\.|192\.168\.|169\.254\.|::1$|fc|fd)/i.test(address),
      )
    ) {
      result.signals.push("private-address-resolution");
    }
    if (
      [...result.a, ...result.aaaa].some(
        (address) => address === "127.0.0.1" || address === "::1",
      )
    ) {
      result.signals.push("localhost-resolution");
    }
    return result;
  }

  public toEvidence(result: DNSAnalysis): Evidence[] {
    return result.signals.map((signal) => ({
      type: "dns-signal",
      severity: signal === "localhost-resolution" ? "medium" : "low",
      title: `DNS signal: ${signal}`,
      description:
        "This DNS observation is contextual evidence and is not a maliciousness verdict.",
      source: "dns-service",
    }));
  }
}
