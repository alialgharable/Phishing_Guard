import { RedirectFetcher } from "./redirectFetcher";
import { buildRedirectEvidence } from "./redirectEvidence";
import { RedirectPolicy } from "./redirectPolicy";
import {
  RedirectAnalysisResult,
  RedirectAnalyzerOptions,
  RedirectError,
  RedirectHop,
} from "./types";

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export class RedirectAnalyzer {
  private readonly fetcher: Pick<RedirectFetcher, "fetch">;
  private readonly policy: RedirectPolicy;

  constructor(options: RedirectAnalyzerOptions = {}) {
    this.policy = options.policy ?? new RedirectPolicy();
    this.fetcher =
      options.fetcher ?? new RedirectFetcher({ policy: this.policy });
  }

  public async analyze(originalUrl: string): Promise<RedirectAnalysisResult> {
    const result: RedirectAnalysisResult = {
      originalUrl,
      finalUrl: null,
      redirectCount: 0,
      hops: [],
      loopDetected: false,
      maxRedirectsReached: false,
      blockedDestination: false,
      timedOut: false,
      completed: false,
      evidence: [],
      errors: [],
    };
    let currentUrl = originalUrl;
    const visited = new Set<string>();

    for (let index = 0; index <= this.policy.config.maxHops; index += 1) {
      const validation = await this.policy.validate(currentUrl);
      if (!validation.allowed) {
        result.blockedDestination = true;
        result.errors.push({
          type: index === 0 ? "invalid-url" : "blocked-destination",
          message: validation.reason ?? "Destination blocked.",
          url: currentUrl,
        });
        result.hops.push(
          this.errorHop(
            index,
            currentUrl,
            validation.reason ?? "Destination blocked.",
          ),
        );
        break;
      }
      const canonical = validation.url?.toString() ?? currentUrl;
      if (visited.has(canonical)) {
        result.loopDetected = true;
        result.errors.push({
          type: "policy",
          message: "Redirect loop detected.",
          url: canonical,
        });
        break;
      }
      visited.add(canonical);

      try {
        const fetched = await this.fetcher.fetch(canonical);
        const location = fetched.response.headers.get("location");
        const hop: RedirectHop = {
          index,
          url: canonical,
          statusCode: fetched.response.status,
          location,
          hostname: validation.url?.hostname ?? null,
          protocol: validation.url?.protocol.replace(":", "") ?? null,
          durationMs: fetched.durationMs,
          error: null,
        };
        result.hops.push(hop);
        if (!REDIRECT_CODES.has(fetched.response.status) || !location) {
          result.finalUrl = canonical;
          result.completed = true;
          break;
        }
        result.redirectCount += 1;
        if (index === this.policy.config.maxHops) {
          result.maxRedirectsReached = true;
          result.errors.push({
            type: "max-redirects",
            message: "Maximum redirect count reached.",
            url: canonical,
          });
          break;
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, canonical);
        } catch {
          result.errors.push({
            type: "invalid-url",
            message: "Redirect location was malformed.",
            url: location,
          });
          break;
        }
        currentUrl = nextUrl.toString();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Redirect request failed.";
        const timedOut = /timed out|abort/i.test(message);
        result.timedOut ||= timedOut;
        result.blockedDestination ||=
          /blocked|private|local|internal|credential|unsupported/i.test(
            message,
          );
        result.errors.push({
          type: timedOut
            ? "timeout"
            : result.blockedDestination
              ? "blocked-destination"
              : /size limit/i.test(message)
                ? "response-too-large"
                : "network",
          message,
          url: canonical,
        });
        result.hops.push(
          this.errorHop(
            index,
            canonical,
            message,
            validation.url?.hostname ?? null,
            validation.url?.protocol.replace(":", "") ?? null,
          ),
        );
        break;
      }
    }
    result.evidence = buildRedirectEvidence(result);
    return result;
  }

  private errorHop(
    index: number,
    url: string,
    error: string,
    hostname: string | null = null,
    protocol: string | null = null,
  ): RedirectHop {
    return {
      index,
      url,
      statusCode: null,
      location: null,
      hostname,
      protocol,
      durationMs: null,
      error,
    };
  }
}
