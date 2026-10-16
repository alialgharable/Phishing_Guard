import { domainToUnicode } from "node:url";
import { UnicodeAnalysis } from "./types";

const SCRIPT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "Latin", regex: /[A-Za-z]/ },
  { name: "Cyrillic", regex: /[А-Яа-яЁё]/ },
  { name: "Greek", regex: /[Α-Ωα-ω]/ },
  { name: "Arabic", regex: /[\u0600-\u06FF]/ },
  { name: "Hebrew", regex: /[\u0590-\u05FF]/ },
  { name: "Han", regex: /[\u4E00-\u9FFF]/ },
  { name: "Hangul", regex: /[\uAC00-\uD7AF]/ },
];

const SUSPICIOUS_UNICODE_CHARS = new Set([
  "\u200B",
  "\u200C",
  "\u200D",
  "\u2060",
  "\u202E",
  "\uFEFF",
]);

export function normalizeUnicode(value: string): string {
  return value.normalize("NFKC");
}

export function decodeIDN(value: string): string {
  if (!value.toLowerCase().includes("xn--")) {
    return value;
  }

  try {
    // ICU handles per-label conversion and any reserved characters. node:punycode is
    // deprecated (DEP0040) and decodes label by label without validation.
    return domainToUnicode(value) || value;
  } catch {
    return value;
  }
}

export function analyzeUnicode(value: string): UnicodeAnalysis {
  const normalized = normalizeUnicode(value);
  const containsUnicode = /[^\u0000-\u007F]/.test(normalized);
  const isPunycode = /xn--/i.test(normalized);
  const scripts = SCRIPT_PATTERNS.filter(({ regex }) =>
    regex.test(normalized),
  ).map(({ name }) => name);
  const hasMixedScripts = scripts.length > 1;
  const suspiciousCharacters = Array.from(normalized).filter(
    (character) =>
      SUSPICIOUS_UNICODE_CHARS.has(character) ||
      /[\u00A0\u2000-\u206F]/.test(character),
  );

  return {
    containsUnicode,
    isPunycode,
    scripts,
    hasMixedScripts,
    suspiciousCharacters,
  };
}
