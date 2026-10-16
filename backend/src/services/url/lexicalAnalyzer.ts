import { KeywordAnalysis, NormalizedURL, URLFeatures } from "./types";

const AUTH_KEYWORDS = [
  "login",
  "signin",
  "sign-in",
  "verify",
  "verification",
  "authenticate",
  "password",
  "credential",
  "account",
  "security",
];

const FINANCIAL_KEYWORDS = [
  "bank",
  "payment",
  "billing",
  "invoice",
  "wallet",
  "transaction",
  "card",
];

const URGENCY_KEYWORDS = [
  "urgent",
  "immediately",
  "suspended",
  "expired",
  "warning",
  "alert",
  "locked",
  "unlock",
];

const SECURITY_KEYWORDS = [
  "secure",
  "protection",
  "safe",
  "security",
  "verification",
  "confirm",
  "identity",
  "user",
];

export function calculateEntropy(value: string): number {
  if (!value) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  const length = value.length;
  let entropy = 0;

  for (const count of counts.values()) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }

  return Number(entropy.toFixed(4));
}

export function analyzeKeywords(input: string): KeywordAnalysis {
  const lower = input.toLowerCase();
  const tokens = new Set(
    lower
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );

  const byCategory = {
    authentication: AUTH_KEYWORDS.filter(
      (keyword) => lower.includes(keyword) || tokens.has(keyword),
    ),
    financial: FINANCIAL_KEYWORDS.filter(
      (keyword) => lower.includes(keyword) || tokens.has(keyword),
    ),
    urgency: URGENCY_KEYWORDS.filter(
      (keyword) => lower.includes(keyword) || tokens.has(keyword),
    ),
    security: SECURITY_KEYWORDS.filter(
      (keyword) => lower.includes(keyword) || tokens.has(keyword),
    ),
  };

  return byCategory;
}

export function extractURLFeatures(normalized: NormalizedURL): URLFeatures {
  const url = normalized.normalized || normalized.original;
  const tokens = url.toLowerCase();
  const keywords = analyzeKeywords(url);
  const entropy = calculateEntropy(url);

  const dotCount = (url.match(/\./g) ?? []).length;
  const hyphenCount = (url.match(/-/g) ?? []).length;
  const underscoreCount = (url.match(/_/g) ?? []).length;
  const slashCount = (url.match(/\//g) ?? []).length;
  const questionMarkCount = (url.match(/\?/g) ?? []).length;
  const ampersandCount = (url.match(/&/g) ?? []).length;
  const equalsCount = (url.match(/=/g) ?? []).length;
  const percentCount = (url.match(/%/g) ?? []).length;
  const atSymbolCount = (url.match(/@/g) ?? []).length;
  const digitCount = (url.match(/[0-9]/g) ?? []).length;
  const letterCount = (url.match(/[a-zA-Z]/g) ?? []).length;
  const specialCharacterCount = Array.from(url).filter(
    (char) => !/[\w\s]/.test(char),
  ).length;

  return {
    urlLength: url.length,
    hostnameLength: normalized.hostname.length,
    pathLength: normalized.pathname.length,
    queryLength: normalized.query.length,
    dotCount,
    hyphenCount,
    underscoreCount,
    slashCount,
    questionMarkCount,
    ampersandCount,
    equalsCount,
    percentCount,
    atSymbolCount,
    digitCount,
    letterCount,
    specialCharacterCount,
    subdomainCount: normalized.subdomains.length,
    hasIpAddress: normalized.isIPAddress,
    hasPort: normalized.port !== null,
    hasCredentials: normalized.hasCredentials,
    hasAtSymbol: atSymbolCount > 0,
    suspiciousKeywordCount: Object.values(keywords).reduce(
      (sum, list) => sum + list.length,
      0,
    ),
    authenticationKeywordCount: keywords.authentication.length,
    financialKeywordCount: keywords.financial.length,
    urgencyKeywordCount: keywords.urgency.length,
    entropy,
  };
}
