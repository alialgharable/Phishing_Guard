import { getDomain } from "tldts";
import { Evidence } from "../url/types";
import { ContentDocumentContext, ScriptAnalysis } from "./types";
import {
  findElements,
  getAttribute,
  ParsedNode,
  textContent,
} from "./htmlAnalyzer";

const SUSPICIOUS_PATTERNS: Array<[string, RegExp]> = [
  ["credential-access", /password|credential|passwd|login/i],
  ["obfuscation", /eval\s*\(|atob\s*\(|fromCharCode|unescape\s*\(/i],
  [
    "redirect-behavior",
    /window\.location|document\.location|location\.replace/i,
  ],
  ["form-interaction", /\.submit\s*\(|addEventListener\s*\(\s*['"]submit/i],
];

export function analyzeScripts(
  root: ParsedNode,
  context: ContentDocumentContext,
): ScriptAnalysis[] {
  return findElements(root, "script").map((script) => {
    const src = getAttribute(script, "src");
    const resolved = src ? resolveUrl(src, context.pageUrl) : null;
    const content = textContent(script, context.maxTextLength);
    const suspiciousPatterns = SUSPICIOUS_PATTERNS.filter(([, pattern]) =>
      pattern.test(content),
    ).map(([name]) => name);
    const sameOrigin = resolved
      ? getDomain(resolved.hostname) === context.pageDomain
      : null;
    const evidence: Evidence[] = [];
    if (suspiciousPatterns.length)
      evidence.push({
        type: "script-pattern",
        severity: "low",
        title: "Suspicious script patterns observed",
        description: `Static inspection found: ${suspiciousPatterns.join(", ")}. Script content was not executed.`,
        source: "script-analyzer",
        group: "CONTENT_STRUCTURE",
        strength: "low",
      });
    if (resolved && sameOrigin === false)
      evidence.push({
        type: "external-script",
        severity: "info",
        title: "External script has a different registrable domain",
        description:
          "Third-party scripts are common and are recorded as contextual evidence only.",
        source: "script-analyzer",
      });
    return {
      src: resolved?.toString() ?? src,
      inline: !src,
      external: Boolean(src),
      domain: resolved ? getDomain(resolved.hostname) : null,
      sameOrigin,
      contentLength: content ? content.length : null,
      suspiciousPatterns,
      evidence,
    };
  });
}
function resolveUrl(value: string, base: URL): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}
