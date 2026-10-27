import type { FulfilmentOption, SiteContent } from "./types";

/**
 * Business configuration for Vintage Magic Beirut.
 *
 * Anything the shop has not confirmed is `null` and rendered as "to be configured in the
 * admin panel", never as an invented value. Values can come from the environment (deployment
 * config) or from `store_content` in the database (owner-editable); the database wins.
 */

export const BRAND = {
  name: "Vintage Magic",
  city: "Beirut",
  tagline: "One-of-a-kind vintage pieces, waiting for their next story.",
  headline: ["PAST LIVES.", "NEVER ORDINARY."],
  cta: "EXPLORE THE ARCHIVE",
} as const;

/** Currency is USD, which is how Beirut second-hand shops routinely price garment stock. */
export const CURRENCY = {
  code: "USD",
  minorUnits: 100,
  symbol: "$",
  locale: "en-US",
} as const;

export const FULFILMENT_OPTIONS: FulfilmentOption[] = [
  {
    id: "pickup_beirut",
    label: "Collect in person, Beirut",
    note: "The piece leaves the public archive the moment the order is placed. You pay in cash at hand-over.",
    feeCents: 0,
    area: "Beirut",
    requiresAddress: false,
  },
  {
    id: "courier_beirut",
    label: "Courier inside Beirut",
    note: "Handed to a courier in Beirut; the shop agrees the time with you after the order. Cash at the door.",
    feeCents: 500,
    area: "Beirut",
    requiresAddress: true,
  },
  {
    id: "courier_lebanon",
    label: "Courier elsewhere in Lebanon",
    note: "Sent anywhere in Lebanon with a courier arranged by the shop. Cash to the courier on delivery.",
    feeCents: 1000,
    area: "Lebanon",
    requiresAddress: true,
  },
];

export const DELIVERY_FEES_NOTE =
  "Delivery fees listed here are the shop's current courier settings. No online payment is taken: every order is settled in cash on collection or on delivery.";

/**
 * A real vintage stockist numbers its courier fees in USD per trip; the amounts above are
 * editable in `src/lib/config.ts` and can be overridden per deployment with
 * `VINTAGE_COURIER_BEIRUT_CENTS` / `VINTAGE_COURIER_LEBANON_CENTS`.
 */
export function fulfilmentOptions(): FulfilmentOption[] {
  const beirut = envInt("VINTAGE_COURIER_BEIRUT_CENTS");
  const lebanon = envInt("VINTAGE_COURIER_LEBANON_CENTS");
  return FULFILMENT_OPTIONS.map((option) => {
    if (option.id === "courier_beirut" && beirut !== undefined) return { ...option, feeCents: beirut };
    if (option.id === "courier_lebanon" && lebanon !== undefined) return { ...option, feeCents: lebanon };
    return option;
  });
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  phone: env("VINTAGE_CONTACT_PHONE"),
  email: env("VINTAGE_CONTACT_EMAIL"),
  instagram: env("VINTAGE_CONTACT_INSTAGRAM"),
  whatsapp: env("VINTAGE_CONTACT_WHATSAPP"),
  addressLine: env("VINTAGE_ADDRESS"),
  hours: env("VINTAGE_HOURS"),
  aboutHeading: "SOME THINGS DESERVE ANOTHER LIFE.",
  // Placeholder house note. It deliberately avoids dates, founders and sourcing stories the shop
  // has not supplied; the owner replaces the whole list in admin -> store content.
  aboutParagraphs: [
    "Vintage Magic is a small archive of second-hand clothing in Beirut. It exists because garments that are already made need the least explaining.",
    "Nothing here is reproduced or restocked. Every entry is measured, checked for damage, described in plain words and photographed once, then listed at the price the shop set for it.",
    "A garment that has already lived a decade of evenings carries information a new item cannot fake: a softened collar, a replaced button, a hem taken up for somebody of a different height. Those marks are kept rather than corrected - they are why the piece is worth a second life.",
    "Most pieces are one of a kind. When one goes, it goes for good, and what stays in the archive is the record of it.",
  ],
  atelierTeaserEnabled: true,
  atelierTeaserCopy:
    "A separate, unfinished idea: taking garments too damaged to wear and cutting them back into something that can be worn again. It is not a shop service yet. It is a studio notebook, and it lives apart from the archive.",
};

/**
 * Sections that must not overstate the business. The reimagining idea is clearly framed as
 * a concept, never as an offered service, and can be switched off entirely.
 */
export const ATELIER_DISCLAIMER = "Not a store service. A studio idea, kept separate from the archive.";

export function env(name: string): string | null {
  // Defensive on purpose: this module is also imported by client components (through `buildQuote`),
  // where there may be no `process` object at all. Server overrides still work.
  const value = typeof process === "undefined" || !process.env ? undefined : process.env[name];
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function envInt(name: string): number | undefined {
  const raw = env(name);
  if (raw === null) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function envFlag(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (raw === null) return fallback;
  return !["0", "false", "off", "no"].includes(raw.toLowerCase());
}
