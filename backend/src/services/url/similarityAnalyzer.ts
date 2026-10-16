import { BrandDefinition, BrandMatch, HomoglyphResult } from "./types";

export const defaultBrandDatabase: BrandDefinition[] = [
  {
    name: "Google",
    domains: ["google.com", "www.google.com", "accounts.google.com"],
    aliases: ["google", "gmail"],
  },
  { name: "GitHub", domains: ["github.com"], aliases: ["github", "git hub"] },
  {
    name: "Microsoft",
    domains: ["microsoft.com"],
    aliases: ["microsoft", "office", "outlook"],
  },
  { name: "PayPal", domains: ["paypal.com"], aliases: ["paypal", "pay pal"] },
];

const RESERVED_BRAND_NAMES = new Set(["example", "test", "localhost"]);
const RESERVED_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "test",
  "invalid",
  "example",
]);

export function normalizeBrandInput(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/\.$/, "")
      .split("@")
      .pop() ?? ""
  );
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, row) => [
    row,
    ...Array(b.length).fill(0),
  ]);
  for (let column = 0; column <= b.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function jaroWinklerSimilarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }

  if (!a.length || !b.length) {
    return 0;
  }

  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const flagsA = new Array(a.length).fill(false);
  const flagsB = new Array(b.length).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (flagsB[j]) {
        continue;
      }
      if (a[i] !== b[j]) {
        continue;
      }
      flagsA[i] = true;
      flagsB[j] = true;
      matches += 1;
      break;
    }
  }

  if (!matches) {
    return 0;
  }

  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!flagsA[i]) {
      continue;
    }
    while (!flagsB[k]) {
      k += 1;
    }
    if (a[i] !== b[k]) {
      transpositions += 1;
    }
    k += 1;
  }

  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) /
    3;
  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i += 1) {
    if (a[i] === b[i]) {
      prefix += 1;
    } else {
      break;
    }
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export function characterNGramSimilarity(
  a: string,
  b: string,
  n: number = 2,
): number {
  if (!a || !b) {
    return 0;
  }

  const aGrams = buildNgrams(a, n);
  const bGrams = buildNgrams(b, n);
  if (!aGrams.length || !bGrams.length) {
    return 0;
  }

  const union = new Set([...aGrams, ...bGrams]);
  let intersection = 0;
  for (const gram of union) {
    if (aGrams.includes(gram) && bGrams.includes(gram)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

function buildNgrams(value: string, n: number): string[] {
  const grams: string[] = [];
  for (let i = 0; i <= value.length - n; i += 1) {
    grams.push(value.slice(i, i + n));
  }
  return grams;
}

export function tokenSimilarity(a: string, b: string): number {
  const left = new Set(a.toLowerCase().split(/[.-]+/).filter(Boolean));
  const right = new Set(b.toLowerCase().split(/[.-]+/).filter(Boolean));
  if (!left.size || !right.size) {
    return 0;
  }

  let common = 0;
  for (const token of left) {
    if (right.has(token)) {
      common += 1;
    }
  }

  return common / Math.max(left.size, right.size);
}

export function detectHomoglyphs(input: string): HomoglyphResult {
  const target = normalizeBrandInput(input);
  const homoglyphMap: Record<string, string[]> = {
    a: ["а", "ɑ", "ａ"],
    c: ["с", "ϲ", "ｃ"],
    d: ["ԁ", "ｄ"],
    e: ["е", "ℯ", "ｅ"],
    i: ["і", "ı", "ⅼ", "ｉ", "1"],
    l: ["ӏ", "I", "ｌ", "1"],
    o: ["о", "ο", "０", "ｏ", "0"],
    p: ["р", "ρ", "ｐ"],
    s: ["ѕ", "ｓ"],
    u: ["υ", "ｕ", "μ"],
    x: ["х", "ｘ"],
    y: ["у", "ｙ"],
    z: ["ƶ", "ｚ"],
  };

  // A host containing a colon is an IPv6 literal and an all-numeric host is an IPv4
  // form. Neither is a domain name whose letters could have been substituted.
  if (/[:/]/.test(target) || /^[0-9.]+$/.test(target)) {
    return {
      detected: false,
      original: input,
      normalized: target,
      suspiciousCharacters: [],
    };
  }

  const suspiciousCharacters: string[] = [];
  // "0" and "1" are listed as look-alikes of letters, so they only mean anything
  // inside a label that is otherwise alphabetic. Without this, every host containing
  // an IP address or a numeric label is reported as a possible homoglyph attack.
  const digitSubstitutes = new Set(["0", "1"]);
  for (const label of target.split(".")) {
    const labelHasLetter = /[a-z]/.test(label);
    for (const char of Array.from(label)) {
      for (const [ascii, alternatives] of Object.entries(homoglyphMap)) {
        if (!alternatives.includes(char)) {
          continue;
        }
        if (digitSubstitutes.has(char) && !labelHasLetter) {
          continue;
        }
        suspiciousCharacters.push(char);
        break;
      }
    }
  }

  const normalized = Array.from(target)
    .map((char) => {
      const matchKey = Object.keys(homoglyphMap).find((key) =>
        homoglyphMap[key].includes(char),
      );
      return matchKey ?? char;
    })
    .join("");

  return {
    detected: suspiciousCharacters.length > 0,
    original: input,
    normalized,
    suspiciousCharacters,
  };
}

export function findBrandMatches(
  submittedDomain: string,
  brands: BrandDefinition[] = defaultBrandDatabase,
): BrandMatch[] {
  const cleaned = normalizeBrandInput(submittedDomain);

  if (RESERVED_DOMAINS.has(cleaned)) return [];

  const matches = brands
    .filter(
      (brand) =>
        !RESERVED_BRAND_NAMES.has(normalizeBrandInput(brand.name)) &&
        !brand.domains.some((domain) =>
          RESERVED_DOMAINS.has(normalizeBrandInput(domain)),
        ),
    )
    .flatMap((brand) => {
      const isOfficialDomain = brand.domains.some((domain) => {
        const officialDomain = normalizeBrandInput(domain);
        return Boolean(
          officialDomain &&
          (cleaned === officialDomain ||
            cleaned.endsWith(`.${officialDomain}`)),
        );
      });
      const candidates = [...brand.domains, ...brand.aliases, brand.name];
      const scores: BrandMatch[] = candidates.map((candidate) => {
        const normalizedCandidate = normalizeBrandInput(candidate);
        const exact = normalizedCandidate === cleaned;
        const domainMatch =
          normalizedCandidate.includes(cleaned) ||
          cleaned.includes(normalizedCandidate);
        const similarity = exact
          ? 1
          : Math.max(
              jaroWinklerSimilarity(cleaned, normalizedCandidate),
              tokenSimilarity(cleaned, normalizedCandidate),
              characterNGramSimilarity(cleaned, normalizedCandidate),
            );
        return {
          brand: brand.name,
          officialDomain: brand.domains[0] ?? cleaned,
          submittedDomain: cleaned,
          similarity: Number(similarity.toFixed(4)),
          matched: Boolean(domainMatch || similarity >= 0.72),
          isOfficialDomain,
          matchType: isOfficialDomain ? "official-domain" : "lookalike",
        };
      });

      const best = scores.reduce<BrandMatch>(
        (bestScore, candidate) => {
          return candidate.similarity > bestScore.similarity
            ? candidate
            : bestScore;
        },
        {
          brand: brand.name,
          officialDomain: brand.domains[0] ?? cleaned,
          submittedDomain: cleaned,
          similarity: 0,
          matched: false,
          isOfficialDomain,
          matchType: "contextual" as const,
        },
      );

      return best.matched ? [best] : [];
    });

  return matches.sort((a, b) => b.similarity - a.similarity);
}
