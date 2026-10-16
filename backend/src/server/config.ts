export interface ServerConfig {
  host: string;
  port: number;
  maxBodyBytes: number;
  maxUrlLength: number;
  scanTimeoutMs: number;
  maxConcurrentScans: number;
  rateLimitPerMinute: number;
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  return {
    host: env.PHISHGUARD_HOST ?? "127.0.0.1",
    port: boundedNumber(env.PHISHGUARD_PORT, 8787, 1, 65535),
    maxBodyBytes: boundedNumber(
      env.PHISHGUARD_MAX_BODY_BYTES,
      16 * 1024,
      1024,
      1024 * 1024,
    ),
    maxUrlLength: boundedNumber(env.PHISHGUARD_MAX_URL_LENGTH, 2048, 64, 8192),
    scanTimeoutMs: boundedNumber(
      env.PHISHGUARD_SCAN_TIMEOUT_MS,
      30_000,
      1000,
      120_000,
    ),
    maxConcurrentScans: boundedNumber(
      env.PHISHGUARD_MAX_CONCURRENT_SCANS,
      4,
      1,
      100,
    ),
    rateLimitPerMinute: boundedNumber(
      env.PHISHGUARD_RATE_LIMIT_PER_MINUTE,
      30,
      1,
      1000,
    ),
  };
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.floor(parsed), minimum), maximum)
    : fallback;
}
