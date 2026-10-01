import type { EvidenceItem } from "../scan";

/** Aggregates display evidence while retaining every original item for audit/debug use. */
export function aggregateEvidence(items: EvidenceItem[]): EvidenceItem[] {
  const groups = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    const key = [item.type, item.category, item.severity, item.title, item.description, item.source].join("|");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].map((group) => group.length === 1 ? group[0] : {
    ...group[0], occurrenceCount: group.length, title: `${group[0].title} (${group.length})`, rawEvidence: group,
  });
}
