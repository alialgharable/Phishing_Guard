export interface SandboxAnalysisResult {
  status: "available" | "unavailable" | "error";
  finalUrl: string | null;
  redirects: string[];
  domainsContacted: string[];
  networkRequests: string[];
  downloads: string[];
  screenshots: string[];
  behaviorObservations: string[];
  reason?: string;
}

export interface SandboxAnalyzer {
  analyze(url: string): Promise<SandboxAnalysisResult>;
}

export class UnavailableSandboxAnalyzer implements SandboxAnalyzer {
  public async analyze(_url: string): Promise<SandboxAnalysisResult> {
    return {
      status: "unavailable",
      finalUrl: null,
      redirects: [],
      domainsContacted: [],
      networkRequests: [],
      downloads: [],
      screenshots: [],
      behaviorObservations: [],
      reason:
        "Dynamic analysis was not performed; the sandbox is not connected.",
    };
  }
}
