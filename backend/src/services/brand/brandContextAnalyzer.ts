import { Evidence } from "../url/types";
import {
  BrandMatch,
  ContextualSignal,
  LoginContextResult,
  PageIdentityResult,
} from "./types";

export function analyzeBrandContext(
  matches: BrandMatch[],
  identity: PageIdentityResult,
  login: LoginContextResult,
  text: string,
): ContextualSignal[] {
  const signals: ContextualSignal[] = [];
  const urgency =
    /urgent|immediately|expires|suspended|locked|action required|verify now/i.test(
      text,
    );
  const financial = /payment|card|billing|bank|transfer|invoice|wallet/i.test(
    text,
  );
  const authentication =
    /password|username|login|sign in|verify account|security code/i.test(text);
  if (urgency && authentication)
    signals.push(
      signal(
        "urgent-authentication",
        "medium",
        ["urgency wording", "authentication wording"],
        "Urgency and authentication wording appeared together.",
      ),
    );
  if (financial && authentication)
    signals.push(
      signal(
        "financial-authentication",
        "low",
        ["financial wording", "authentication wording"],
        "Financial and authentication wording appeared together.",
      ),
    );
  if (matches.length && login.loginOriented)
    signals.push(
      signal(
        "brand-login-context",
        "info",
        ["brand reference", "login-oriented context"],
        "A detected brand appears in a login-oriented page context.",
      ),
    );
  if (
    matches.length &&
    identity.category !== "generic-information" &&
    login.credentialCollection
  )
    signals.push(
      signal(
        "brand-credential-context",
        "medium",
        ["brand identity", "credential form", identity.category],
        "Brand identity and credential collection context were observed together.",
      ),
    );
  return signals;
}

function signal(
  type: string,
  severity: ContextualSignal["severity"],
  indicators: string[],
  description: string,
): ContextualSignal {
  const evidence: Evidence = {
    type,
    severity,
    title: "Multiple contextual indicators observed",
    description,
    source: "brand-context-analyzer",
  };
  return { type, severity, indicators, evidence };
}
