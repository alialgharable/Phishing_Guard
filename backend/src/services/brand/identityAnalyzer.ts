import { Evidence } from "../url/types";
import {
  BrandProfile,
  PageIdentityResult,
  PageIdentityCategory,
} from "./types";

const CATEGORY_TERMS: Array<[PageIdentityCategory, string[]]> = [
  ["login", ["login", "log in", "sign in", "signin", "authenticate", "password", "username", "credential", "logon", "signon"]],
  ["account", ["account", "verify account", "profile", "secure account", "recover account", "update account"]],
  ["payment", ["payment", "billing", "invoice", "card", "credit card", "debit card", "transaction"]],
  ["banking", ["bank", "banking", "transfer", "wire transfer", "routing number", "account number", "online banking"]],
  ["email", ["mailbox", "email", "inbox", "webmail", "messages"]],
  ["social-media", ["social", "friends", "timeline", "followers", "posts", "connect"]],
  ["cloud-storage", ["cloud storage", "drive", "documents", "files", "attachment"]],
  ["shopping", ["cart", "checkout", "shop", "order", "buy now", "shipping"]],
  ["cryptocurrency", ["crypto", "wallet", "bitcoin", "ethereum", "seed phrase", "metamask", "coinbase"]],
];

export function analyzeIdentity(
  title: string,
  visibleText: string,
  headings: string[],
  brands: BrandProfile[],
): PageIdentityResult {
  const combined =
    `${title} ${headings.join(" ")} ${visibleText}`.toLowerCase();
  const indicators: string[] = [];
  let category: PageIdentityCategory = "unknown";
  let bestCount = 0;
  for (const [candidate, terms] of CATEGORY_TERMS) {
    const found = terms.filter((term) => combined.includes(term));
    if (found.length > bestCount) {
      category = candidate;
      bestCount = found.length;
      indicators.push(...found);
    }
  }
  if (category === "unknown" && combined.length > 0)
    category = "generic-information";
  const brandReferences = brands
    .filter((brand) =>
      [brand.name, ...brand.aliases, ...brand.keywords].some((term) =>
        combined.includes(term.toLowerCase()),
      ),
    )
    .map((brand) => brand.name);
  const uniqueIndicators = [...new Set(indicators)].filter(Boolean);
  const evidence: Evidence[] =
    category !== "unknown" && uniqueIndicators.length > 0
      ? [
          {
            type: "page-identity",
            severity: "info",
            title: `Page identity appears ${category}-oriented`,
            description: `Static content contained contextual indicators: ${uniqueIndicators.join(", ")}.`,
            source: "identity-analyzer",
          },
        ]
      : [];
  return {
    category,
    indicators: [...new Set(indicators)],
    brandReferences,
    evidence,
  };
}
