import dns from "node:dns/promises";
import net from "node:net";

export interface ResolvedAddress { address: string; family: 4 | 6 }
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface DestinationValidation {
  allowed: boolean;
  reason?: string;
  hostname: string;
  addresses: ResolvedAddress[];
}

const IPV4_BLOCKED_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32",
  // Common Docker defaults.
  "172.17.0.0/16",
  "172.18.0.0/16",
  "172.19.0.0/16",
  // Common Kubernetes service ranges.
  "10.96.0.0/12",
];

const IPV6_BLOCKED_CIDRS = [
  "::/128",
  "::1/128",
  "::ffff:0:0/96",
  "64:ff9b::/96",
  "100::/64",
  "2001::/23",
  "2001:db8::/32",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
];

export const DEFAULT_BLOCKED_CIDRS = [...IPV4_BLOCKED_CIDRS, ...IPV6_BLOCKED_CIDRS];

/**
 * Names that are never public on the Internet. Resolving them inside a container can
 * reach the host or a cloud metadata service, and a trailing root dot must not turn
 * `metadata.google.internal` into an unrestricted name, so these are matched against
 * the canonical host form.
 */
const RESERVED_NAME_SUFFIXES = [".local", ".internal", ".home.arpa", ".in-addr.arpa", ".ip6.arpa"];

/**
 * Host form used for every policy decision: bracket-free, lower-cased and without
 * the root label dot. DNS treats `example.com.` and `example.com` as the same name
 * and resolvers follow the trailing-dot form to the same records, so a name rule
 * that compares raw hostnames is bypassed by one extra dot.
 */
export function canonicalHost(host: string | undefined): string {
  const stripped = (host ?? "").replace(/^\[(.*)]$/, "$1").toLowerCase();
  return stripped.replace(/\.+$/, "");
}

/**
 * True only when both hosts are known and resolve to different canonical names.
 * Behavioral evidence about "the page moved to another domain" must not fire for a
 * missing host (`about:blank` after an aborted navigation) or for the same name
 * written two ways.
 */
export function hostsDiffer(initialHost: string | undefined, finalHost: string | undefined): boolean {
  const before = canonicalHost(initialHost);
  const after = canonicalHost(finalHost);
  return before.length > 0 && after.length > 0 && before !== after;
}

export const nodeResolver: Resolver = async (hostname: string) => {
  const family = net.isIP(hostname);
  if (family === 4 || family === 6) return [{ address: hostname, family }];
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family as 4 | 6 }));
};

function ipv4ToBigInt(ip: string): bigint | undefined {
  const parts = ip.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return undefined;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return undefined;
    value = (value << 8n) + BigInt(octet);
  }
  return value;
}

function parseIpv6(ip: string): bigint | undefined {
  const zoneIndex = ip.indexOf("%");
  const cleaned = (zoneIndex >= 0 ? ip.slice(0, zoneIndex) : ip).toLowerCase();
  const embeddedIpv4Match = cleaned.match(/(.+:)(\d+\.\d+\.\d+\.\d+)$/);
  let normalized = cleaned;
  if (embeddedIpv4Match?.[1] && embeddedIpv4Match[2]) {
    const ipv4 = ipv4ToBigInt(embeddedIpv4Match[2]);
    if (ipv4 === undefined) return undefined;
    const hi = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const lo = Number(ipv4 & 0xffffn).toString(16);
    normalized = `${embeddedIpv4Match[1]}${hi}:${lo}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = halves.length === 2 ? [...left, ...Array<string>(missing).fill("0"), ...right] : left;
  if (groups.length !== 8) return undefined;
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return undefined;
    value = (value << 16n) + BigInt(Number.parseInt(group, 16));
  }
  return value;
}

function parseIp(ip: string): { family: 4 | 6; value: bigint; bits: bigint } | undefined {
  const family = net.isIP(ip);
  if (family === 4) {
    const value = ipv4ToBigInt(ip);
    return value === undefined ? undefined : { family, value, bits: 32n };
  }
  if (family === 6) {
    const value = parseIpv6(ip);
    return value === undefined ? undefined : { family, value, bits: 128n };
  }
  return undefined;
}

function parseCidr(cidr: string): { family: 4 | 6; base: bigint; prefix: bigint; bits: bigint } | undefined {
  const [baseIp, prefixText] = cidr.split("/");
  if (!baseIp || !prefixText) return undefined;
  const parsed = parseIp(baseIp);
  if (!parsed) return undefined;
  const prefixNumber = Number(prefixText);
  if (!Number.isInteger(prefixNumber) || prefixNumber < 0 || prefixNumber > Number(parsed.bits)) return undefined;
  return { family: parsed.family, base: parsed.value, prefix: BigInt(prefixNumber), bits: parsed.bits };
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const parsedIp = parseIp(ip);
  const parsedCidr = parseCidr(cidr);
  if (!parsedIp || !parsedCidr || parsedIp.family !== parsedCidr.family) return false;
  if (parsedCidr.prefix === 0n) return true;
  const shift = parsedCidr.bits - parsedCidr.prefix;
  return (parsedIp.value >> shift) === (parsedCidr.base >> shift);
}

/** True when an address string can be evaluated against the policy at all. */
export function isParsableAddress(ip: string): boolean {
  return parseIp(ip) !== undefined;
}

/**
 * A resolved address this service cannot parse is treated as blocked. Returning
 * `false` for unparseable input would let an odd textual form (a bracketed literal,
 * a leading-zero octet, a trailing dot) walk straight past the deny list, and a
 * sandbox deny list has to fail closed.
 */
export function isBlockedAddress(ip: string, extraBlockedCidrs: string[] = []): boolean {
  if (!isParsableAddress(ip)) return true;
  return [...DEFAULT_BLOCKED_CIDRS, ...extraBlockedCidrs].some((cidr) => ipInCidr(ip, cidr));
}

export async function validateDestination(
  target: URL,
  options: { resolver?: Resolver; extraBlockedCidrs?: string[]; allowedProtocols?: Set<string> } = {},
): Promise<DestinationValidation> {
  const allowedProtocols = options.allowedProtocols ?? new Set(["http:", "https:"]);
  const hostname = canonicalHost(target.hostname);
  if (!allowedProtocols.has(target.protocol)) {
    return { allowed: false, reason: `protocol ${target.protocol} is not allowed`, hostname, addresses: [] };
  }
  if (!hostname) return { allowed: false, reason: "hostname is required", hostname, addresses: [] };
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { allowed: false, reason: "localhost is blocked", hostname, addresses: [] };
  }
  const reserved = RESERVED_NAME_SUFFIXES.find((suffix) => hostname.endsWith(suffix));
  if (reserved) {
    return { allowed: false, reason: `${hostname} is a reserved internal name (${reserved})`, hostname, addresses: [] };
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await (options.resolver ?? nodeResolver)(hostname);
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? `DNS resolution failed: ${error.message}` : "DNS resolution failed",
      hostname,
      addresses: [],
    };
  }
  if (addresses.length === 0) return { allowed: false, reason: "hostname resolved to no addresses", hostname, addresses };
  const unparseable = addresses.find((address) => !isParsableAddress(address.address));
  if (unparseable) {
    return {
      allowed: false,
      reason: `resolved address ${unparseable.address} could not be parsed and is blocked`,
      hostname,
      addresses,
    };
  }
  const blocked = addresses.find((address) => isBlockedAddress(address.address, options.extraBlockedCidrs));
  if (blocked) {
    return { allowed: false, reason: `resolved address ${blocked.address} is blocked`, hostname, addresses };
  }
  return { allowed: true, hostname, addresses };
}
