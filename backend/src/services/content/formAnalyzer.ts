import { getDomain } from "tldts";
import { Evidence } from "../url/types";
import { ContentDocumentContext, FormAnalysis } from "./types";
import { findElements, getAttribute, ParsedNode } from "./htmlAnalyzer";

export function analyzeForms(
  root: ParsedNode,
  context: ContentDocumentContext,
): FormAnalysis[] {
  return findElements(root, "form").map((form) => {
    const rawAction = getAttribute(form, "action");
    const action = resolveUrl(rawAction, context.pageUrl);
    const actionDomain = action ? getDomain(action.hostname) : null;
    const sameOrigin = action
      ? getDomain(action.hostname) === context.pageDomain
      : null;
    const inputs = findDescendants(form, "input");
    const passwordInputCount = inputs.filter((input) =>
      ["password"].includes(
        (getAttribute(input, "type") ?? "text").toLowerCase(),
      ),
    ).length;
    const emailInputCount = inputs.filter(
      (input) =>
        ["email"].includes((getAttribute(input, "type") ?? "").toLowerCase()) ||
        /email/.test(
          `${getAttribute(input, "name") ?? ""} ${getAttribute(input, "id") ?? ""}`.toLowerCase(),
        ),
    ).length;
    const hiddenInputCount = inputs.filter(
      (input) => (getAttribute(input, "type") ?? "").toLowerCase() === "hidden",
    ).length;
    const credentialLike = inputs.some((input) =>
      /user|login|email|account|pass|credential|token/.test(
        `${getAttribute(input, "name") ?? ""} ${getAttribute(input, "id") ?? ""} ${getAttribute(input, "autocomplete") ?? ""}`.toLowerCase(),
      ),
    );
    const externalAction = sameOrigin === false;
    const evidence: Evidence[] = [];
    if (externalAction)
      evidence.push({
        type: "external-form-action",
        severity: "medium",
        title: "Form submits to a different registrable domain",
        description:
          "Cross-domain form submission is contextual evidence and is not proof of phishing.",
        source: "form-analyzer",
      });
    if (action?.protocol === "http:" && context.pageUrl.protocol === "https:")
      evidence.push({
        type: "insecure-form-action",
        severity: "medium",
        title: "Secure page contains an HTTP form action",
        description: "The form target uses HTTP while the page uses HTTPS.",
        source: "form-analyzer",
      });
    if (!rawAction)
      evidence.push({
        type: "empty-form-action",
        severity: "info",
        title: "Form has no explicit action",
        description:
          "The form uses its document URL or browser default submission behavior.",
        source: "form-analyzer",
      });
    return {
      action: action?.toString() ?? rawAction,
      method: getAttribute(form, "method"),
      sameOrigin,
      actionDomain,
      inputCount: inputs.length,
      passwordInputCount,
      emailInputCount,
      hiddenInputCount,
      hasPasswordField: passwordInputCount > 0,
      hasCredentialLikeFields: credentialLike,
      externalAction,
      evidence,
    };
  });
}

function resolveUrl(value: string | null, base: URL): URL | null {
  if (!value) return null;
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}
function findDescendants(root: ParsedNode, tagName: string): ParsedNode[] {
  const found: ParsedNode[] = [];
  for (const child of root.childNodes ?? []) {
    if (child.tagName?.toLowerCase() === tagName) found.push(child);
    found.push(...findDescendants(child, tagName));
  }
  return found;
}
