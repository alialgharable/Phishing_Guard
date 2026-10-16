import type { EvidenceItem } from "../scan";
import { analyzeHostLabels, hasNonAsciiText, observeCharacters } from "./unicodeAnalyzer";
import type { UnicodeAnalysis, UnicodeObservation, UrlAnalysis, UrlIssue, UrlIssueCode, UrlIssueSeverity } from "./types";

/**
 * URL intake for PhishGuard.
 *
 * The WHATWG URL parser is deliberately forgiving: it deletes tab and newline
 * characters, strips leading and trailing C0 controls, applies UTS #46 IDNA mapping
 * to the host (which deletes zero-width characters and folds ideographic full stops
 * into `.`), collapses numeric host forms such as `http://2130706433/` into
 * `127.0.0.1`, and drops default ports. Several of those rewrites can turn a string
 * no other tool accepts into a well-known, safe-looking host.
 *
 * This module keeps the submitted text untouched, records every rewrite it can
 * observe, and rejects input whose meaning cannot be preserved. It produces no risk
 * verdict: a URL that survives normalization is not a safe URL.
 */

export const MAX_URL_INPUT_LENGTH = 4096;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;
const AUTHORITY_END = /[/?#]/;
const PARSER_EDGE = /^[\x00-\x20]+|[\x00-\x20]+$/g;

function issue(code: UrlIssueCode, severity: UrlIssueSeverity, message: string, codePoints?: string[]): UrlIssue {
  return { code, severity, message, ...(codePoints && codePoints.length > 0 ? { codePoints } : {}) };
}

/** The only trimming performed anywhere: exactly what the URL parser discards itself. */
function stripParserEdgeCharacters(input: string): string {
  return input.replace(PARSER_EDGE, "");
}

/** Host text without the port or user information, plus its absolute span in the input. */
function rawHostRegion(input: string): { host: string; authority: string; start: number; end: number } {
  const candidate = stripParserEdgeCharacters(input);
  const prefix = SCHEME_PREFIX.exec(candidate);
  if (!prefix) return { host: "", authority: "", start: 0, end: 0 };
  const authorityStart = prefix[0].length;
  const rest = candidate.slice(authorityStart);
  const authorityEnd = rest.search(AUTHORITY_END);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const separator = authority.lastIndexOf("@");
  const hostPort = separator === -1 ? authority : authority.slice(separator + 1);
  let hostLength = hostPort.length;
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    hostLength = close === -1 ? hostPort.length : close + 1;
  } else {
    const colon = hostPort.lastIndexOf(":");
    if (colon !== -1 && !hostPort.slice(colon + 1).includes("]")) hostLength = colon;
  }
  const leading = /^[\x00-\x20]*/.exec(input)?.[0].length ?? 0;
  const hostStart = authorityStart + (separator === -1 ? 0 : separator + 1);
  return {
    host: hostPort.slice(0, hostLength),
    authority,
    start: leading + hostStart,
    end: leading + hostStart + hostLength,
  };
}

function emptyReport(analysis: { observations: UnicodeObservation[]; hasNonAscii: boolean }): UnicodeAnalysis {
  return {
    ...analysis,
    punycodeLabels: [],
    unicodeHost: "",
    hostHasNonAscii: false,
    fullStopLookalikes: [],
  };
}

function rejected(input: string, blocking: UrlIssue[]): UrlAnalysis {
  const observations = observeCharacters(input);
  return {
    status: "rejected",
    input,
    blockingIssues: blocking,
    ambiguousIssues: [],
    contextIssues: [],
    href: "",
    lookupHref: "",
    hostname: "",
    canonicalHostname: "",
    port: "",
    scheme: "",
    unicode: emptyReport({ observations, hasNonAscii: hasNonAsciiText(input) }),
  };
}

/**
 * Host form used for policy and equality comparisons: bracket-free, lower-cased and
 * without the root label dot. `localhost.` and `localhost` are the same destination,
 * and comparing them as strings without this step silently defeats a name rule.
 */
export function canonicalHostname(host: string | undefined): string {
  const stripped = (host ?? "").replace(/^\[(.*)]$/, "$1").toLowerCase();
  return stripped.replace(/\.+$/, "");
}

export function normalizeUrl(input: unknown): UrlAnalysis {
  if (typeof input !== "string") {
    return rejected("", [issue("INPUT_NOT_A_STRING", "blocking", "A URL string is required.")]);
  }
  if (input.length === 0 || stripParserEdgeCharacters(input).length === 0) {
    return rejected(input, [issue("INPUT_EMPTY", "blocking", "Enter a URL to analyze.")]);
  }
  if (input.length > MAX_URL_INPUT_LENGTH) {
    return rejected(input, [
      issue("INPUT_TOO_LONG", "blocking", `Enter a URL of ${MAX_URL_INPUT_LENGTH} characters or fewer. The submitted value was not truncated.`),
    ]);
  }

  const blocking: UrlIssue[] = [];
  const ambiguous: UrlIssue[] = [];
  const context: UrlIssue[] = [];
  const observations = observeCharacters(input);

  const control = observations.filter((item) => item.category === "control");
  if (control.length > 0) {
    blocking.push(
      issue(
        "FORBIDDEN_CONTROL_CHARACTER",
        "blocking",
        "The URL contains control characters. URL parsers delete or ignore them, so the analyzed address would not be the submitted address.",
        control.map((item) => item.codePoint),
      ),
    );
  }

  const spaces = observations.filter((item) => item.category === "whitespace");
  if (spaces.length > 0) {
    blocking.push(
      issue(
        "AMBIGUOUS_WHITESPACE",
        "blocking",
        "The URL contains a non-standard space character. Trimming and URL parsing disagree about it, so the value was not normalized.",
        spaces.map((item) => item.codePoint),
      ),
    );
  }

  const region = rawHostRegion(input);
  const hidden = observations.filter((item) => item.category === "invisible" || item.category === "bidi");
  const hostHidden = hidden.filter((item) => item.index >= region.start && item.index < region.end);
  if (hostHidden.length > 0) {
    blocking.push(
      issue(
        "INVISIBLE_HOST_CHARACTER",
        "blocking",
        "The host contains invisible or direction-changing characters that IDNA removes. Analysis would silently target a different host than the one written.",
        hostHidden.map((item) => item.codePoint),
      ),
    );
  }
  if (hidden.length > hostHidden.length) {
    ambiguous.push(
      issue(
        "INVISIBLE_CHARACTER_PRESERVED",
        "ambiguous",
        "The URL contains invisible characters outside the host. They are percent-encoded and preserved, but they stay invisible when displayed.",
        hidden.filter((item) => !hostHidden.includes(item)).map((item) => item.codePoint),
      ),
    );
  }

  if (blocking.length > 0) return rejected(input, blocking);

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return rejected(input, [issue("UNPARSEABLE", "blocking", "Enter a valid absolute URL.")]);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return rejected(input, [
      issue("UNSUPPORTED_SCHEME", "blocking", `Only HTTP and HTTPS URLs are accepted, not ${url.protocol.replace(":", "").toUpperCase() || "an empty scheme"}.`),
    ]);
  }
  const canonical = canonicalHostname(url.hostname);
  if (canonical.length === 0) {
    return rejected(input, [issue("EMPTY_HOST", "blocking", "The URL has no host to analyze.")]);
  }
  if (region.authority.length === 0) {
    // `http:///path` has an empty authority, and the WHATWG parser answers with the
    // host `path`. Analyzing that silently would target something the caller never wrote.
    return rejected(input, [
      issue("EMPTY_HOST", "blocking", "The URL has no host between \"//\" and the next separator. It was not analyzed, because the parser would read the first path segment as the host."),
    ]);
  }

  const unicode = {
    ...analyzeHostLabels(region.host, url.hostname),
    hasNonAscii: hasNonAsciiText(input),
    observations,
  };

  if (region.authority.includes("@") || url.username.length > 0 || url.password.length > 0) {
    ambiguous.push(
      issue(
        "CREDENTIALS_PRESENT",
        "ambiguous",
        `The URL embeds user information before the host, so the text before "@" is not the destination. The analyzed host is ${canonical}; the credential text is not sent to providers or to the sandbox.`,
      ),
    );
  }

  // Case folding and the root label dot are the only rewrites treated as cosmetic.
  // Anything else the parser changed is reported, because the analyzed host is then
  // not the host that was written down.
  const literalHost = canonicalHostname(region.host);
  if (literalHost.length > 0 && literalHost !== canonical && !unicode.hostHasNonAscii) {
    ambiguous.push(
      issue(
        "HOST_REWRITTEN_BY_PARSER",
        "ambiguous",
        `The submitted host "${region.host}" was normalized to "${canonical}" before analysis. Results describe the normalized host, not the literal text.`,
      ),
    );
  }

  if (unicode.hostHasNonAscii) {
    ambiguous.push(
      issue(
        "UNICODE_HOST",
        "ambiguous",
        `The host contains non-ASCII characters and was converted to "${canonical}" for analysis. Displayed and analyzed forms differ; this is recorded, not judged.`,
      ),
    );
  }
  if (unicode.fullStopLookalikes.length > 0) {
    ambiguous.push(
      issue(
        "HOST_REWRITTEN_BY_PARSER",
        "ambiguous",
        "The host uses a full stop look-alike, which decides where host label boundaries fall. Only the analyzed host is reliable.",
        unicode.fullStopLookalikes,
      ),
    );
  }
  if (unicode.punycodeLabels.length > 0) {
    context.push(issue("PUNYCODE_HOST", "context", `The host contains internationalized labels; decoded display form is "${unicode.unicodeHost}".`));
  }
  if (url.hostname !== canonical) {
    context.push(
      issue("TRAILING_DOT_HOST", "context", `The host ends in a root-label dot. Policy and domain comparisons use "${canonical}", which resolves to the same DNS name.`),
    );
  }
  if (url.port.length > 0) {
    context.push(issue("EXPLICIT_PORT", "context", `A non-default port (${url.port}) was supplied and retained in the analyzed URL.`));
  }

  const lookup = new URL(url.href);
  lookup.username = "";
  lookup.password = "";

  return {
    status: "ok",
    input,
    blockingIssues: [],
    ambiguousIssues: ambiguous,
    contextIssues: context,
    href: url.href,
    lookupHref: lookup.href,
    hostname: url.hostname,
    canonicalHostname: canonical,
    port: url.port,
    scheme: url.protocol,
    unicode,
  };
}

/**
 * Turns normalization findings into displayable evidence. Everything is `context`
 * severity on purpose: a URL that is unusual to parse is not proof of wrongdoing and
 * a URL that parses cleanly is not proof of innocence.
 */
export function urlAnalysisEvidence(analysis: UrlAnalysis): EvidenceItem[] {
  const describe = (finding: UrlIssue, type: string, prefix: string): EvidenceItem => ({
    type,
    category: "url_normalization",
    severity: "context",
    title: `${prefix}: ${finding.code.toLowerCase().replaceAll("_", " ")}`,
    description: finding.message,
    source: "Static URL normalizer",
    confidence: null,
    ...(finding.codePoints ? { rawEvidence: [finding.codePoints] } : {}),
  });
  return [
    ...analysis.ambiguousIssues.map((finding) => describe(finding, "URL_NORMALIZATION", "URL normalization")),
    ...analysis.contextIssues.map((finding) => describe(finding, "URL_STRUCTURE", "URL structure")),
  ];
}
