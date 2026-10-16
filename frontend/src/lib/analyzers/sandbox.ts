import type { AnalysisContext, SandboxAnalyzer } from "./contracts";
import type { SandboxResult } from "../scan";

export class UnavailableSandboxAnalyzer implements SandboxAnalyzer {
  async analyze(context: AnalysisContext): Promise<SandboxResult> {
    void context;
    return {
      status: "unavailable",
      redirects: [], domainsContacted: [], networkRequests: [], downloads: [], screenshots: [], behaviorObservations: [],
      message: "Dynamic sandbox analysis is not connected; no live browsing was performed.",
    };
  }
}
