import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { RedirectPolicyConfig, RedirectPolicyOptions } from "./types";

const DEFAULTS: RedirectPolicyConfig = {
  maxHops: Number.parseInt(process.env.REDIRECT_MAX_HOPS ?? "8", 10),
  timeoutMs: Number.parseInt(process.env.REDIRECT_TIMEOUT_MS ?? "5000", 10),
  maxResponseBytes: Number.parseInt(
    process.env.REDIRECT_MAX_RESPONSE_BYTES ?? "1048576",
    10,
  ),
};

function isPrivateIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

export class RedirectPolicy {
  public readonly config: RedirectPolicyConfig;
  private readonly resolver: (hostname: string) => Promise<string[]>;

  constructor(options: RedirectPolicyOptions = {}) {
    this.config = {
      maxHops: clamp(options.config?.maxHops ?? DEFAULTS.maxHops, 0, 20),
      timeoutMs: clamp(
        options.config?.timeoutMs ?? DEFAULTS.timeoutMs,
        100,
        30_000,
      ),
      maxResponseBytes: clamp(
        options.config?.maxResponseBytes ?? DEFAULTS.maxResponseBytes,
        1_024,
        10 * 1024 * 1024,
      ),
    };
    this.resolver =
      options.resolver ??
      (async (hostname) =>
        (await lookup(hostname, { all: true })).map(
          (record) => record.address,
        ));
  }

  public async validate(
    urlValue: string,
  ): Promise<{ allowed: boolean; reason: string | null; url: URL | null }> {
    let url: URL;
    try {
      url = new URL(urlValue);
    } catch {
      return { allowed: false, reason: "URL is malformed.", url: null };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        allowed: false,
        reason: "Only HTTP and HTTPS destinations are permitted.",
        url,
      };
    }
    if (url.username || url.password) {
      return {
        allowed: false,
        reason: "URLs containing credentials are not permitted.",
        url,
      };
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "metadata.google.internal" ||
      hostname === "host.docker.internal"
    ) {
      return {
        allowed: false,
        reason: "Local, internal, and metadata destinations are blocked.",
        url,
      };
    }
    const addressType = isIP(hostname);
    if (addressType === 4 && isPrivateIPv4(hostname))
      return {
        allowed: false,
        reason: "Private or local IPv4 destinations are blocked.",
        url,
      };
    if (addressType === 6 && isPrivateIPv6(hostname))
      return {
        allowed: false,
        reason: "Private or local IPv6 destinations are blocked.",
        url,
      };
    if (addressType === 0) {
      let addresses: string[];
      try {
        addresses = await this.resolver(hostname);
      } catch {
        return {
          allowed: false,
          reason: "Destination DNS resolution failed safely.",
          url,
        };
      }
      if (
        addresses.some(
          (address) =>
            (isIP(address) === 4 && isPrivateIPv4(address)) ||
            (isIP(address) === 6 && isPrivateIPv6(address)),
        )
      ) {
        return {
          allowed: false,
          reason: "Destination resolves to a private or local address.",
          url,
        };
      }
    }
    return { allowed: true, reason: null, url };
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.floor(value), minimum), maximum)
    : minimum;
}
