import { getDomain } from "tldts";
import { isIP } from "node:net";
import { NormalizedURL } from "./types";

function normalizeHostname(value: string): string {
  if (!value) {
    return "";
  }

  return value.trim().replace(/\.$/, "");
}

function extractProtocol(value: string): string {
  const match = value.trim().match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);

  return match ? match[1].toLowerCase() : "";
}

function extractHostname(value: string): string {
  const trimmed = value.trim();

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

    if (
      withoutCredentials.startsWith("[") &&
      withoutCredentials.includes("]")
    ) {
      return withoutCredentials.replace(/^\[|\]$/g, "").replace(/:\d+$/, "");
    }

    return withoutCredentials.replace(/:\d+$/, "").replace(/\.$/, "");
  }
}

function extractPath(value: string): string {
  const trimmed = value.trim();

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
  const trimmed = value.trim();

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
  const trimmed = value.trim();

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

function extractPort(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.port ? Number.parseInt(parsed.port, 10) : null;
  } catch {
    const match = trimmed.match(
      /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?(?:[^@/]+@)?(?:\[[^\]]+\]|[^:/?#]+)(?::(\d+))?/i,
    );

    if (!match || !match[1]) {
      return null;
    }

    return Number.parseInt(match[1], 10);
  }
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
    .replace(new RegExp(`\\.${registrableDomain}$`), "")
    .split(".")
    .filter(Boolean);
}

export function normalizeURL(input: string): NormalizedURL {
  const original = input ?? "";
  const trimmed = original.trim();
  const protocol = extractProtocol(trimmed);
  const hostname = normalizeHostname(extractHostname(trimmed));

  const parsed = (() => {
    try {
      return new URL(trimmed);
    } catch {
      return null;
    }
  })();

  const normalized = parsed ? parsed.toString() : trimmed;
  const registrableDomain = hostname ? getDomain(hostname) || null : null;
  const subdomains = getSubdomains(hostname, registrableDomain);
  const port = extractPort(trimmed);
  const pathname = extractPath(trimmed);
  const query = extractQuery(trimmed);
  const fragment = extractFragment(trimmed);
  const username = parsed?.username || null;

  const hasCredentials =
    Boolean(parsed && (parsed.username || parsed.password)) ||
    trimmed.includes("@");

  const isIPv4 = hostname ? isIP(hostname) === 4 : false;
  const ipv6Candidate = hostname.replace(/^\[|\]$/g, "");
  const isIPv6 = hostname ? isIP(ipv6Candidate) === 6 : false;
  const isPunycode = hostname ? /xn--/i.test(hostname) : false;
  const isIPAddress = isIPv4 || isIPv6;

  return {
    original,
    normalized,
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
