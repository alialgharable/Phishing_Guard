import { domainToUnicode } from "node:url";
import type { UnicodeObservation } from "./types";

/**
 * Unicode / IDNA inspection for submitted URLs.
 *
 * The purpose is detection, not judgement: a homoglyph or an invisible character is
 * reported as a normalization ambiguity so the analyst can see that the analyzed host
 * is not the host that was written down. Absence of findings is never evidence that a
 * URL is legitimate.
 */

const NAMES: ReadonlyMap<number, string> = new Map<number, string>([
  [0x0000, "NULL"],
  [0x0009, "TAB"],
  [0x000a, "LINE FEED"],
  [0x000b, "LINE TABULATION"],
  [0x000c, "FORM FEED"],
  [0x000d, "CARRIAGE RETURN"],
  [0x001b, "ESCAPE"],
  [0x007f, "DELETE"],
  [0x00ad, "SOFT HYPHEN"],
  [0x034f, "COMBINING GRAPHEME JOINER"],
  [0x061c, "ARABIC LETTER MARK"],
  [0x1680, "OGHAM SPACE MARK"],
  [0x180e, "MONGOLIAN VOWEL SEPARATOR"],
  [0x2000, "EN QUAD"],
  [0x2001, "EM QUAD"],
  [0x2002, "EN SPACE"],
  [0x2003, "EM SPACE"],
  [0x2004, "THREE-PER-EM SPACE"],
  [0x2005, "FOUR-PER-EM SPACE"],
  [0x2006, "SIX-PER-EM SPACE"],
  [0x2007, "FIGURE SPACE"],
  [0x2008, "PUNCTUATION SPACE"],
  [0x2009, "THIN SPACE"],
  [0x200a, "HAIR SPACE"],
  [0x200b, "ZERO WIDTH SPACE"],
  [0x200c, "ZERO WIDTH NON-JOINER"],
  [0x200d, "ZERO WIDTH JOINER"],
  [0x200e, "LEFT-TO-RIGHT MARK"],
  [0x200f, "RIGHT-TO-LEFT MARK"],
  [0x2028, "LINE SEPARATOR"],
  [0x2029, "PARAGRAPH SEPARATOR"],
  [0x202a, "LEFT-TO-RIGHT EMBEDDING"],
  [0x202b, "RIGHT-TO-LEFT EMBEDDING"],
  [0x202c, "POP DIRECTIONAL FORMATTING"],
  [0x202d, "LEFT-TO-RIGHT OVERRIDE"],
  [0x202e, "RIGHT-TO-LEFT OVERRIDE"],
  [0x202f, "NARROW NO-BREAK SPACE"],
  [0x205f, "MEDIUM MATHEMATICAL SPACE"],
  [0x2060, "WORD JOINER"],
  [0x2061, "FUNCTION APPLICATION"],
  [0x2062, "INVISIBLE TIMES"],
  [0x2063, "INVISIBLE SEPARATOR"],
  [0x3000, "IDEOGRAPHIC SPACE"],
  [0x00a0, "NO-BREAK SPACE"],
  [0xfeff, "ZERO WIDTH NO-BREAK SPACE (BOM)"],
  [0xff0e, "FULLWIDTH FULL STOP"],
  [0xff61, "HALFWIDTH IDEOGRAPHIC FULL STOP"],
  [0x3002, "IDEOGRAPHIC FULL STOP"],
]);

/** True when any code point in the text is outside printable ASCII. */
export function hasNonAsciiText(text: string): boolean {
  return [...text].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint > 0x7e;
  });
}

export function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function characterLabel(codePoint: number): string {
  return NAMES.get(codePoint) ?? "UNASSIGNED CHARACTER";
}

export function isControlCharacter(codePoint: number): boolean {
  return codePoint <= 0x1f || codePoint === 0x7f || (codePoint >= 0x80 && codePoint <= 0x9f);
}

/**
 * Default-ignorable and bidi formatting characters. The IDNA/WHATWG pipeline can
 * delete these from a host, so `pay\u200Bpal.com` and `paypal.com` parse to the same
 * host. They must never be removed quietly.
 */
export function isInvisibleCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x00ad ||
    codePoint === 0x034f ||
    codePoint === 0x061c ||
    codePoint === 0x180e ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x2064) ||
    codePoint === 0xfeff ||
    codePoint === 0xe0001 ||
    (codePoint >= 0xe0020 && codePoint <= 0xe007f)
  );
}

export function isBidiFormattingCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x061c ||
    (codePoint >= 0x200e && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e)
  );
}

/**
 * Space separators that are not part of the WHATWG input stream. `String.trim()`
 * removes them, the URL parser does not, so they produce two different "valid"
 * URLs from one paste.
 */
export function isAmbiguousSpaceCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x00a0 ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000
  );
}

export function isFullStopLookalike(codePoint: number): boolean {
  return codePoint === 0xff0e || codePoint === 0xff61 || codePoint === 0x3002;
}

function categoryFor(codePoint: number): UnicodeObservation["category"] | undefined {
  if (isControlCharacter(codePoint)) return "control";
  if (isBidiFormattingCharacter(codePoint)) return "bidi";
  if (isInvisibleCharacter(codePoint)) return "invisible";
  if (isAmbiguousSpaceCharacter(codePoint)) return "whitespace";
  return undefined;
}

/** Every code point in `input` that a URL parser is allowed to move or delete. */
export function observeCharacters(input: string): UnicodeObservation[] {
  const observations: UnicodeObservation[] = [];
  let index = 0;
  for (const character of input) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) {
      const category = categoryFor(codePoint);
      if (category) {
        observations.push({ codePoint: formatCodePoint(codePoint), label: characterLabel(codePoint), category, index });
      }
    }
    index += character.length;
  }
  return observations;
}

export interface HostUnicodeReport {
  punycodeLabels: string[];
  unicodeHost: string;
  hostHasNonAscii: boolean;
  fullStopLookalikes: string[];
}

/** Inspects the raw (pre-parse) host label text for IDNA-relevant characters. */
export function analyzeHostLabels(rawHost: string, parsedHost: string): HostUnicodeReport {
  const stripped = rawHost.replace(/^\[(.*)]$/, "$1");
  const hostHasNonAscii = hasNonAsciiText(stripped);
  const fullStopLookalikes = [...stripped]
    .filter((character) => isFullStopLookalike(character.codePointAt(0) ?? 0))
    .map((character) => formatCodePoint(character.codePointAt(0) ?? 0));
  const hostname = parsedHost.replace(/^\[(.*)]$/, "$1").toLowerCase();
  const punycodeLabels = hostname.split(".").filter((label) => label.startsWith("xn--"));
  let unicodeHost = hostname;
  if (punycodeLabels.length > 0) {
    try {
      const decoded = domainToUnicode(hostname);
      if (decoded) unicodeHost = decoded;
    } catch {
      // Keep the ASCII form when ICU cannot decode a label; that is a display
      // limitation only and never changes the analysis target.
    }
  }
  return { punycodeLabels, unicodeHost, hostHasNonAscii, fullStopLookalikes };
}
