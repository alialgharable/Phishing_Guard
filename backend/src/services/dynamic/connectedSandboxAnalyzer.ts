import {
  runInSandbox,
  SandboxUnavailableError,
} from "./runInSandbox";
import type { SandboxAnalyzer, SandboxAnalysisResult } from "./sandboxAnalyzer";
import type { DetonationResult } from "./types";

export class ConnectedSandboxAnalyzer implements SandboxAnalyzer {
  public async analyze(url: string): Promise<SandboxAnalysisResult> {
    try {
      const result: DetonationResult = await runInSandbox(url, {
        submitCanary: false,
      });

      const domains = new Set<string>();
      for (const request of result.requests) {
        try {
          domains.add(new URL(request.url).hostname);
        } catch {
          // Ignore malformed captured request URLs.
        }
      }

      const screenshots = result.screenshot
        ? [`data:image/png;base64,${result.screenshot.toString("base64")}`]
        : [];

      const observations = [
        ...result.apiEvents.map((event) => `Browser event: ${event.api}`),
        ...result.errors.map((error) => `Browser error: ${error}`),
        ...result.blockedRequests.map((request) => `Blocked request: ${request}`),
        ...(result.forms.length
          ? [`Detected ${result.forms.length} form(s).`]
          : []),
        ...(result.submitted ? ["A form submission was recorded."] : []),
      ];

      return {
        status: "available",
        finalUrl: result.finalUrl || result.landingUrl || null,
        redirects: result.redirectChain,
        domainsContacted: [...domains],
        networkRequests: result.requests.map(
          (request) => `${request.method} ${request.url}`,
        ),
        downloads: result.downloads.map(
          (download) =>
            `${download.suggestedName} (${download.bytes} bytes, SHA-256 ${download.sha256})`,
        ),
        screenshots,
        behaviorObservations: observations,
      };
    } catch (error) {
      return {
        status: error instanceof SandboxUnavailableError ? "unavailable" : "error",
        finalUrl: null,
        redirects: [],
        domainsContacted: [],
        networkRequests: [],
        downloads: [],
        screenshots: [],
        behaviorObservations: [],
        reason:
          error instanceof Error
            ? error.message
            : "Dynamic sandbox analysis failed.",
      };
    }
  }
}
