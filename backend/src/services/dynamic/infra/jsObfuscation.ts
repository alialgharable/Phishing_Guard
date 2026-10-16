import type { DetonationResult, DynamicEvidence } from "../types";

export function shannonEntropy(value: string): number {
  if (!value.length) return 0;
  const counts = new Map<string, number>();
  for (const character of value)
    counts.set(character, (counts.get(character) ?? 0) + 1);
  return [...counts.values()].reduce((total, count) => {
    const probability = count / value.length;
    return total - probability * Math.log2(probability);
  }, 0);
}

export function scoreScript(source: string): {
  score: number;
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0;
  const add = (points: number, signal: string) => {
    score += points;
    signals.push(signal);
  };
  if ((source.match(/\beval\s*\(/g) ?? []).length) add(10, "eval");
  if ((source.match(/new\s+Function\s*\(/g) ?? []).length)
    add(10, "Function-constructor");
  if ((source.match(/\batob\s*\(/g) ?? []).length >= 3) add(10, "atob-chain");
  if ((source.match(/String\.fromCharCode/g) ?? []).length >= 5)
    add(10, "fromCharCode");
  if ((source.match(/\b_0x[a-f0-9]{3,6}\b/g) ?? []).length >= 10)
    add(25, "obfuscator-identifiers");
  const blob = /["'`]([A-Za-z0-9+/=_-]{200,})["'`]/.exec(source);
  if (blob && shannonEntropy(blob[1]) > 4.8) add(15, "high-entropy-blob");
  return { score: Math.min(100, score), signals };
}

export function scriptsOf(
  result: Pick<DetonationResult, "html" | "scripts">,
): string[] {
  const inline = [
    ...result.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
  ]
    .map((match) => match[1])
    .filter(Boolean);
  return [...inline, ...result.scripts.map((script) => script.body)];
}

export function obfuscationEvidence(
  result: Pick<DetonationResult, "html" | "scripts">,
): DynamicEvidence[] {
  const top = scriptsOf(result)
    .map(scoreScript)
    .sort((left, right) => right.score - left.score)[0];
  if (!top || top.score < 30) return [];
  return [
    {
      id: "js.obfuscated",
      group: "behavioral",
      score: top.score >= 50 ? 22 : 10,
      description: `Obfuscated JavaScript indicators: ${top.signals.join(", ")}`,
      data: { score: top.score },
    },
  ];
}
