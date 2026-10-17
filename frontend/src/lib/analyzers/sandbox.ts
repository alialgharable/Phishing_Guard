import type { AnalysisContext, SandboxAnalyzer } from "./contracts";
import type { EvidenceItem, SandboxResult } from "../scan";

type RemoteSandboxResult = SandboxResult & {
  status?: string;
  durationMs?: number;
  terminationReason?: string;
  limitsReached?: string[];
};

function unavailable(message: string): SandboxResult {
  return {
    status: "unavailable",
    redirects: [],
    domainsContacted: [],
    networkRequests: [],
    downloads: [],
    screenshots: [],
    behaviorObservations: [],
    message,
  };
}

function normalizeStatus(status: string | undefined): SandboxResult["status"] {
  switch (status?.toLowerCase()) {
    case "available":
      return "available";
    case "timeout":
      return "timeout";
    case "blocked":
      return "blocked";
    case "error":
      return "error";
    case "unavailable":
      return "unavailable";
    default:
      return "error";
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeEvidence(value: unknown): EvidenceItem[] {
  return asArray<EvidenceItem>(value).filter(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.type === "string" &&
      typeof item.severity === "string" &&
      typeof item.title === "string" &&
      typeof item.description === "string" &&
      typeof item.source === "string",
  );
}

export class UnavailableSandboxAnalyzer implements SandboxAnalyzer {
  async analyze(context: AnalysisContext): Promise<SandboxResult> {
    void context;
    return unavailable("Dynamic sandbox analysis is not connected; no live browsing was performed.");
  }
}

export class HttpSandboxAnalyzer implements SandboxAnalyzer {
  constructor(
    private readonly endpoint = process.env.SANDBOX_API_URL,
    private readonly token = process.env.SANDBOX_API_TOKEN,
    private readonly timeoutMs = Number.parseInt(process.env.SANDBOX_API_TIMEOUT_MS ?? "35000", 10),
  ) {}

  async analyze(context: AnalysisContext): Promise<SandboxResult> {
    if (!this.endpoint || !this.token) {
      return unavailable("Dynamic sandbox analysis is not configured; SANDBOX_API_URL and SANDBOX_API_TOKEN are required.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(this.timeoutMs) ? this.timeoutMs : 35_000);
    try {
      const response = await fetch(`${this.endpoint.replace(/\/$/, "")}/analyze`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${this.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: context.url.href, requestId: crypto.randomUUID() }),
        signal: controller.signal,
      });
      let payload: RemoteSandboxResult | undefined;
      try {
        payload = (await response.json()) as RemoteSandboxResult;
      } catch {
        // handled below
      }
      if (!response.ok) {
        return {
          ...unavailable(`Dynamic sandbox service returned HTTP ${response.status}.`),
          status: response.status === 401 ? "unavailable" : "error",
        };
      }
      if (!payload) return { ...unavailable("Dynamic sandbox service returned an invalid response."), status: "error" };
      return {
        status: normalizeStatus(payload.status),
        finalUrl: typeof payload.finalUrl === "string" ? payload.finalUrl : undefined,
        httpStatus: typeof payload.httpStatus === "number" ? payload.httpStatus : undefined,
        redirects: asArray(payload.redirects),
        domainsContacted: asArray<string>(payload.domainsContacted).filter((item) => typeof item === "string"),
        networkRequests: asArray(payload.networkRequests),
        downloads: asArray(payload.downloads),
        screenshots: asArray(payload.screenshots),
        behaviorObservations: normalizeEvidence(payload.behaviorObservations),
        message: typeof payload.message === "string" ? payload.message : undefined,
        durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
        terminationReason: typeof payload.terminationReason === "string" ? payload.terminationReason : undefined,
        limitsReached: asArray<string>(payload.limitsReached).filter((item) => typeof item === "string"),
      };
    } catch (error) {
      return {
        ...unavailable(error instanceof Error ? `Dynamic sandbox analysis failed: ${error.message}` : "Dynamic sandbox analysis failed."),
        status: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "error",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function configuredSandboxAnalyzer(): SandboxAnalyzer {
  return process.env.SANDBOX_API_URL && process.env.SANDBOX_API_TOKEN
    ? new HttpSandboxAnalyzer()
    : new UnavailableSandboxAnalyzer();
}
