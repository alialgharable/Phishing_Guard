export interface SandboxConfig {
  port: number;
  host: string;
  apiToken: string | undefined;
  navigationTimeoutMs: number;
  overallTimeoutMs: number;
  maxRedirects: number;
  maxRequests: number;
  maxDownloadBytes: number;
  maxScreenshotBytes: number;
  maxResponseBodyBytes: number;
  artifactRetentionMs: number;
  artifactDir: string;
  allowedProtocols: Set<string>;
  extraBlockedCidrs: string[];
}

function intFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(): SandboxConfig {
  return {
    port: intFromEnv("PORT", 4001),
    host: process.env.HOST ?? "0.0.0.0",
    apiToken: process.env.SANDBOX_API_TOKEN,
    navigationTimeoutMs: intFromEnv("SANDBOX_NAVIGATION_TIMEOUT_MS", 15_000),
    overallTimeoutMs: intFromEnv("SANDBOX_OVERALL_TIMEOUT_MS", 30_000),
    maxRedirects: intFromEnv("SANDBOX_MAX_REDIRECTS", 8),
    maxRequests: intFromEnv("SANDBOX_MAX_REQUESTS", 200),
    maxDownloadBytes: intFromEnv("SANDBOX_MAX_DOWNLOAD_BYTES", 5 * 1024 * 1024),
    maxScreenshotBytes: intFromEnv("SANDBOX_MAX_SCREENSHOT_BYTES", 2 * 1024 * 1024),
    maxResponseBodyBytes: intFromEnv("SANDBOX_MAX_RESPONSE_BODY_BYTES", 128 * 1024),
    artifactRetentionMs: intFromEnv("SANDBOX_ARTIFACT_RETENTION_MS", 10 * 60 * 1000),
    artifactDir: process.env.SANDBOX_ARTIFACT_DIR ?? "/tmp/phishguard-sandbox-artifacts",
    allowedProtocols: new Set(["http:", "https:"]),
    extraBlockedCidrs: (process.env.SANDBOX_BLOCKED_CIDRS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}
