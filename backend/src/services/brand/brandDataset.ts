import { BrandProfile } from "./types";

export const defaultBrandProfiles: BrandProfile[] = [
  {
    id: "google",
    name: "Google",
    aliases: ["Google", "Gmail"],
    officialDomains: ["google.com", "accounts.google.com"],
    keywords: ["google", "gmail"],
    categories: ["email"],
  },
  {
    id: "github",
    name: "GitHub",
    aliases: ["GitHub", "Git Hub"],
    officialDomains: ["github.com"],
    keywords: ["github", "git hub"],
    categories: ["developer-tools"],
  },
  {
    id: "microsoft",
    name: "Microsoft",
    aliases: ["Microsoft", "Office", "Outlook"],
    officialDomains: ["microsoft.com", "office.com", "outlook.com"],
    keywords: ["microsoft", "office", "outlook"],
    categories: ["productivity"],
  },
  {
    id: "paypal",
    name: "PayPal",
    aliases: ["PayPal", "Pay Pal"],
    officialDomains: ["paypal.com"],
    keywords: ["paypal", "pay pal"],
    categories: ["payments"],
  },
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

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

export function normalizeBrandText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isReservedBrandName(value: string): boolean {
  return RESERVED_BRAND_NAMES.has(normalizeBrandText(value));
}

export function isReservedDomain(value: string): boolean {
  return RESERVED_DOMAINS.has(normalizeDomain(value));
}
