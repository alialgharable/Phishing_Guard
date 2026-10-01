import type { ThreatIntelligenceStatus } from "../scan";
import type { ThreatIntelligence } from "./contracts";

type Result = ThreatIntelligenceStatus & { category?: string; confidence?: number | null };
const timeoutMs = 8_000;
async function request(url: string, init?: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
}
function unavailable(provider: string, variable: string): Result {
  return { provider, status: "unavailable", state: "UNAVAILABLE", message: `${variable} is not configured.` };
}
function failure(provider: string, error: unknown): Result {
  return { provider, status: "error", state: "ERROR", message: error instanceof Error ? error.message : "Provider request failed." };
}

export class GoogleWebRisk implements ThreatIntelligence {
  provider = "Google Web Risk";
  async check(url: URL): Promise<Result> {
    const key = process.env.GOOGLE_WEB_RISK_API_KEY;
    if (!key) return unavailable(this.provider, "GOOGLE_WEB_RISK_API_KEY");
    try {
      const query = new URLSearchParams({ uri: url.href, key });
      for (const type of ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]) query.append("threatTypes", type);
      const response = await request(`https://webrisk.googleapis.com/v1/uris:search?${query}`);
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
      const body = await response.json() as { threat?: { threatTypes?: string[] } };
      const types = body.threat?.threatTypes ?? [];
      return types.length
        ? { provider: this.provider, status: "match", state: "MATCH", category: types.includes("SOCIAL_ENGINEERING") ? "phishing" : "malware", confidence: null, message: `Matched: ${types.join(", ")}.` }
        : { provider: this.provider, status: "checked", state: "NO_MATCH", message: "No list match returned." };
    } catch (error) { return failure(this.provider, error); }
  }
}

export class PhishTank implements ThreatIntelligence {
  provider = "PhishTank";
  async check(url: URL): Promise<Result> {
    const key = process.env.PHISHTANK_API_KEY;
    if (!key) return unavailable(this.provider, "PHISHTANK_API_KEY");
    try {
      const body = new URLSearchParams({ url: url.href, format: "json", app_key: key });
      const response = await request("https://checkurl.phishtank.com/checkurl/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "PhishGuard/1.0" }, body });
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
      const payload = await response.json() as { results?: { in_database?: boolean; verified?: boolean; valid?: boolean } };
      const hit = payload.results?.in_database === true && payload.results?.verified === true && payload.results?.valid === true;
      return hit
        ? { provider: this.provider, status: "match", state: "MATCH", category: "phishing", confidence: null, message: "Verified active phishing entry matched." }
        : { provider: this.provider, status: "checked", state: "NO_MATCH", message: "No verified active match returned." };
    } catch (error) { return failure(this.provider, error); }
  }
}

export class URLhaus implements ThreatIntelligence {
  provider = "URLhaus";
  async check(url: URL): Promise<Result> {
    const key = process.env.URLHAUS_AUTH_KEY;
    if (!key) return unavailable(this.provider, "URLHAUS_AUTH_KEY");
    try {
      const response = await request("https://urlhaus-api.abuse.ch/v1/url/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "Auth-Key": key }, body: new URLSearchParams({ url: url.href }) });
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
      const payload = await response.json() as { query_status?: string; threat?: string };
      if (payload.query_status === "ok") return { provider: this.provider, status: "match", state: "MATCH", category: payload.threat ?? "malware", confidence: null, message: "URLhaus entry matched." };
      if (["no_results", "invalid_url"].includes(payload.query_status ?? "")) return { provider: this.provider, status: "checked", state: "NO_MATCH", message: "No URLhaus match returned." };
      throw new Error(`Unexpected provider status: ${payload.query_status ?? "missing"}.`);
    } catch (error) { return failure(this.provider, error); }
  }
}

export const threatProviders: ThreatIntelligence[] = [new GoogleWebRisk(), new PhishTank(), new URLhaus()];
