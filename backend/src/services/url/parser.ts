import { getDomain } from "tldts";
import { ParsedURLInfo } from "./types";

function extractHostname(raw: string): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.hostname || null;
  } catch {
    const match = trimmed.match(/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?([^/?#]+)/i);
    if (!match) {
      return null;
    }

    const authority = match[1];
    const withoutAuth = authority.includes("@")
      ? (authority.split("@").pop() ?? authority)
      : authority;
    const host = withoutAuth.replace(/^\[|\]$/g, "");
    return host.replace(/:\d+$/, "").replace(/\.$/, "") || null;
  }
}

export function parseURL(input: string): ParsedURLInfo {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      scheme: null,
      hostname: null,
      registrableDomain: null,
      subdomain: null,
      port: null,
      path: "",
      query: "",
      fragment: "",
      username: null,
    };
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname || null;
    const registrableDomain = hostname ? getDomain(hostname) || null : null;
    const subdomain =
      hostname && registrableDomain && hostname !== registrableDomain
        ? hostname.slice(0, hostname.length - registrableDomain.length - 1) ||
          null
        : null;

    return {
      scheme: url.protocol.replace(":", "") || null,
      hostname,
      registrableDomain,
      subdomain: subdomain ? subdomain.replace(/\.$/, "") : null,
      port: url.port ? Number.parseInt(url.port, 10) : null,
      path: url.pathname || "",
      query: url.search || "",
      fragment: url.hash || "",
      username: url.username || null,
    };
  } catch {
    const host = extractHostname(trimmed);
    const registrableDomain = host ? getDomain(host) || null : null;
    const subdomain =
      host && registrableDomain && host !== registrableDomain
        ? host.slice(0, host.length - registrableDomain.length - 1) || null
        : null;

    const auth = trimmed.match(/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?([^@/]+)@/);
    const username = auth ? auth[1] || null : null;

    return {
      scheme: trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*)\:\/\//)?.[1] || null,
      hostname: host,
      registrableDomain,
      subdomain: subdomain ? subdomain.replace(/\.$/, "") : null,
      port: null,
      path: trimmed.split(/[?#]/)[0] ?? "",
      query: trimmed.includes("?")
        ? trimmed.slice(trimmed.indexOf("?") + 1).split("#")[0]
        : "",
      fragment: trimmed.includes("#")
        ? trimmed.slice(trimmed.indexOf("#") + 1)
        : "",
      username,
    };
  }
}
