import { parse } from "parse5";
import { HTMLAnalysis } from "./types";

export interface ParsedAttribute {
  name: string;
  value: string;
}
export interface ParsedNode {
  nodeName: string;
  tagName?: string;
  attrs?: ParsedAttribute[];
  childNodes?: ParsedNode[];
  value?: string;
}

export function parseHTML(html: string): ParsedNode {
  return parse(html, { scriptingEnabled: false }) as unknown as ParsedNode;
}

export function walkElements(
  root: ParsedNode,
  visitor: (node: ParsedNode) => void,
  maxNodes = 10000,
): number {
  let count = 0;
  const visit = (node: ParsedNode): void => {
    if (count >= maxNodes) return;
    if (node.tagName) {
      count += 1;
      visitor(node);
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  return count;
}

export function getAttribute(node: ParsedNode, name: string): string | null {
  return (
    node.attrs?.find(
      (attribute) => attribute.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? null
  );
}

export function textContent(node: ParsedNode, maxLength = 100000): string {
  let output = "";
  const visit = (current: ParsedNode): void => {
    if (output.length >= maxLength) return;
    if (current.nodeName === "#text" && current.value)
      output += `${current.value} `;
    for (const child of current.childNodes ?? []) visit(child);
  };
  visit(node);
  return normalizeWhitespace(output).slice(0, maxLength);
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function analyzeHTML(root: ParsedNode, maxNodes: number): HTMLAnalysis {
  const analysis: HTMLAnalysis = {
    elementCount: 0,
    scriptCount: 0,
    iframeCount: 0,
    formCount: 0,
    inputCount: 0,
    hiddenElementCount: 0,
    externalResourceCount: 0,
    inlineStyleCount: 0,
    inlineScriptCount: 0,
    metaRefreshDetected: false,
    titleLength: 0,
  };
  walkElements(
    root,
    (node) => {
      analysis.elementCount += 1;
      const tag = node.tagName?.toLowerCase();
      if (tag === "script") {
        analysis.scriptCount += 1;
        if (!getAttribute(node, "src")) analysis.inlineScriptCount += 1;
      }
      if (tag === "iframe") analysis.iframeCount += 1;
      if (tag === "form") analysis.formCount += 1;
      if (tag === "input") {
        analysis.inputCount += 1;
        if ((getAttribute(node, "type") ?? "").toLowerCase() === "hidden")
          analysis.hiddenElementCount += 1;
      }
      if (getAttribute(node, "style") !== null) analysis.inlineStyleCount += 1;
      if (
        tag === "meta" &&
        (getAttribute(node, "http-equiv") ?? "").toLowerCase() === "refresh"
      )
        analysis.metaRefreshDetected = true;
      if (
        [
          "img",
          "iframe",
          "script",
          "link",
          "object",
          "embed",
          "video",
          "audio",
          "source",
        ].includes(tag ?? "")
      ) {
        if (
          getAttribute(node, "src") ||
          getAttribute(node, "href") ||
          getAttribute(node, "data")
        )
          analysis.externalResourceCount += 1;
      }
    },
    maxNodes,
  );
  return analysis;
}

export function findElements(
  root: ParsedNode,
  tagName: string,
  maxNodes = 10000,
): ParsedNode[] {
  const found: ParsedNode[] = [];
  walkElements(
    root,
    (node) => {
      if (node.tagName?.toLowerCase() === tagName.toLowerCase())
        found.push(node);
    },
    maxNodes,
  );
  return found;
}
