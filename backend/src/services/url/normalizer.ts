import { getDomain } from "tldts";
import { isIP } from "node:net";
import { NormalizedURL } from "./types";

/**
 * The WHATWG URL parser discards only C0 controls and U+0020 at the edges of its
 * input. `String.prototype.trim()` additionally removes U+00A0 and the other Unicode
 * separators, and that difference can turn a host the parser rejects into a host it
 * accepts, so trimming is deliberately not used anywhere in this module.
 */
export function stripParserEdgeCharacters(value: string): string {
  return value.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
}

// Only forms that can legitimately appear in a host are accepted. Anything else yields
// an empty host, so an unparseable input can never be analyzed as some other,
// apparently reachable destination.
const ASCII_HOST_PATTERN = /^[a-z0-9._-]+$/;

function normalizeHostname(value: string): string {
  if (!value) {
    return "";
  }

  const bracketed = value.replace(/^\[([^\]]*)]$/, "$1");
  const candidate = bracketed.toLowerCase().replace(/\.$/, "");

  if (!candidate) {
    return "";
  }

  if (candidate.includes(":") || candidate.includes("%")) {
    return isIP(candidate) === 6 ? candidate : "";
  }

  return ASCII_HOST_PATTERN.test(candidate) ? candidate : "";
}

function normalizePort(value: number | null): number | null {
  if (value === null || !Number.isInteger(value) || value < 0 || value > 65535) {
    return null;
  }

  return value;
}

function extractProtocol(value: string): string {
  const match = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);

  return match ? (match[1] ?? "").toLowerCase() : "";
}

function extractHostname(value: string): string {
  const trimmed = value;

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    return normalizeHostname(parsed.hostname);
  } catch {
    const match = trimmed.match(/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?([^/?#]+)/i);

    if (!match) {
      return "";
    }

    const authority = match[1];

    if (!authority) {
      return "";
    }

    const withoutCredentials = authority.includes("@")
      ? (authority.split("@").pop() ?? authority)
      : authority;

    if (!withoutCredentials) {
      return "";
    }

    return normalizeHostname(withoutCredentials.replace(/:\d+$/, ""));
  }
}

function extractPath(value: string): string {
  const trimmed = value;

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.pathname || "";
  } catch {
    const hashIndex = trimmed.indexOf("#");
    const pathAndQuery = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;

    const withoutProtocol = pathAndQuery.replace(
      /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//,
      "",
    );

    const withoutAuthority = withoutProtocol.includes("/")
      ? withoutProtocol.slice(withoutProtocol.indexOf("/"))
      : "/";

    return withoutAuthority || "/";
  }
}

function extractQuery(value: string): string {
  const trimmed = value;

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.search || "";
  } catch {
    const questionIndex = trimmed.indexOf("?");

    if (questionIndex < 0) {
      return "";
    }

    const hashIndex = trimmed.indexOf("#", questionIndex);

    return trimmed.slice(
      questionIndex + 1,
      hashIndex >= 0 ? hashIndex : trimmed.length,
    );
  }
}

function extractFragment(value: string): string {
  const trimmed = value;

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.hash || "";
  } catch {
    const hashIndex = trimmed.indexOf("#");

    return hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : "";
  }
}

function extractPort(value: string, parsed: URL | null): number | null {
  const trimmed = value;

  if (!trimmed) {
    return null;
  }

  if (parsed) {
    return parsed.port ? normalizePort(Number.parseInt(parsed.port, 10)) : null;
  }

  const match = trimmed.match(
    /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?(?:[^@/]+@)?(?:\[[^\]]+\]|[^:/?#]+)(?::(\d+))?/i,
  );

  if (!match || !match[1]) {
    return null;
  }

  return normalizePort(Number.parseInt(match[1], 10));
}

function getSubdomains(
  hostname: string,
  registrableDomain: string | null,
): string[] {
  if (!hostname || !registrableDomain || hostname === registrableDomain) {
    return [];
  }

  const suffix = `.${registrableDomain}`;

  if (hostname.endsWith(suffix)) {
    return hostname.slice(0, -suffix.length).split(".").filter(Boolean);
  }

  return hostname
    .replace(new RegExp(`\\.${registrableDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "")
    .split(".")
    .filter(Boolean);
}

export function normalizeURL(input: string): NormalizedURL {
  const original = input ?? "";
  const trimmed = stripParserEdgeCharacters(original);
  const protocol = extractProtocol(trimmed);

  const parsed = (() => {
    try {
      return new URL(trimmed);
    } catch {
      return null;
    }
  })();

  // A serialization is only produced when the URL parser accepted the input AND the
  // host survived validation. Reporting a URL for a host the analyzers could not name
  // would advertise a destination that nothing downstream can actually use.
  const hostname = extractHostname(trimmed);
  const normalized = parsed && hostname ? parsed.toString() : "";
  const registrableDomain = hostname ? getDomain(hostname) || null : null;
  const subdomains = getSubdomains(hostname, registrableDomain);
  const port = extractPort(trimmed, parsed);
  const pathname = extractPath(trimmed);
  const query = extractQuery(trimmed);
  const fragment = extractFragment(trimmed);
  const username = parsed?.username || null;

  // Credentials exist only in the authority component. Looking for "@" anywhere in the
  // string reports an email address in a query or fragment as embedded credentials.
  const hasCredentials = Boolean(
    parsed && (parsed.username || parsed.password),
  );

  const isIPv4 = hostname ? isIP(hostname) === 4 : false;
  const isIPv6 = hostname ? isIP(hostname) === 6 : false;
  const isPunycode = hostname ? /xn--/i.test(hostname) : false;
  const isIPAddress = isIPv4 || isIPv6;

  return {
    original,
    normalized,
    parseable: Boolean(parsed),
    protocol,
    hostname,
    registrableDomain,
    subdomains,
    port,
    pathname,
    query,
    fragment,
    username,
    hasCredentials,
    isIPAddress,
    isIPv4,
    isIPv6,
    isPunycode,
  };
}
