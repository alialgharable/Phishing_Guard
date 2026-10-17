/**
 * Shared types for PhishGuard's URL analysis layer.
 *
 * This module deliberately contains no policy decisions: URL analysis describes
 * what the submitted string *is* (and how the WHATWG parser had to change it to
 * reach a parseable URL). Whether a URL is malicious remains the job of the
 * evidence aggregator, so nothing here may imply safety.
 */

export type UrlIssueSeverity = "blocking" | "ambiguous" | "context";

export type UrlIssueCode =
  | "INPUT_NOT_A_STRING"
  | "INPUT_EMPTY"
  | "INPUT_TOO_LONG"
  | "FORBIDDEN_CONTROL_CHARACTER"
  | "INVISIBLE_HOST_CHARACTER"
  | "AMBIGUOUS_WHITESPACE"
  | "UNPARSEABLE"
  | "EMPTY_HOST"
  | "UNSUPPORTED_SCHEME"
  | "CREDENTIALS_PRESENT"
  | "TRAILING_DOT_HOST"
  | "UNICODE_HOST"
  | "PUNYCODE_HOST"
  | "HOST_REWRITTEN_BY_PARSER"
  | "EXPLICIT_PORT"
  | "INVISIBLE_CHARACTER_PRESERVED";

export interface UrlIssue {
  code: UrlIssueCode;
  severity: UrlIssueSeverity;
  /** Human-readable, factual. Never says a URL is safe or malicious. */
  message: string;
  /** Code points involved, e.g. "U+200B". */
  codePoints?: string[];
}

export interface UnicodeObservation {
  /** "U+200B" style code point, for unambiguous operator reporting. */
  codePoint: string;
  /** Best-effort Unicode name for a small set of security-relevant characters. */
  label: string;
  category: "control" | "invisible" | "bidi" | "whitespace";
  index: number;
}

export interface UnicodeAnalysis {
  /** True when the submitted string contains a code point that is not printable ASCII. */
  hasNonAscii: boolean;
  /** Control, invisible, bidi and odd-space characters found in the submitted string. */
  observations: UnicodeObservation[];
  /** `xn--` labels present in the parsed host. */
  punycodeLabels: string[];
  /** Unicode display form of the parsed host, or the parsed host when unavailable. */
  unicodeHost: string;
  /** True when the raw host text contains a character outside printable ASCII. */
  hostHasNonAscii: boolean;
  /** Code points of characters IDNA folds into `.`, which moves label boundaries. */
  fullStopLookalikes: string[];
}

export interface UrlAnalysis {
  /**
   * `ok` means a parseable HTTP(S) URL was produced. `rejected` means a blocking
   * issue was found and nothing about the target may be claimed.
   */
  status: "ok" | "rejected";
  /** Exactly what the caller submitted, byte for byte. Never rewritten. */
  input: string;
  blockingIssues: UrlIssue[];
  ambiguousIssues: UrlIssue[];
  contextIssues: UrlIssue[];
  /** Canonical WHATWG serialization of the analyzed URL, when parseable. */
  href: string;
  /**
   * Canonical URL with any user information removed. This is the only form that
   * may leave the process, so pasted credentials are never forwarded to providers
   * or to the sandbox.
   */
  lookupHref: string;
  /** Parsed host as the browser sees it (percent/punycode encoded, may end in a dot). */
  hostname: string;
  /** Host normalized for policy checks: bracket-stripped, lower-cased, no root label dot. */
  canonicalHostname: string;
  port: string;
  scheme: string;
  unicode: UnicodeAnalysis;
}
