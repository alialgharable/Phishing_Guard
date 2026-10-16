import { FEATURE_REGISTRY } from "./featureRegistry";
import { FeatureVector } from "./types";
import { encodeCategorical } from "./categoricalEncoder";

export function toFeatureArray(vector: FeatureVector): number[] {
  const encoded = encodeCategorical(vector);
  return FEATURE_REGISTRY.filter(
    (definition) => definition.type !== "categorical",
  ).map((definition) => encoded[definition.name] ?? 0);
}
export function featureVectorToRow(
  vector: FeatureVector,
): Record<string, number> {
  const encoded = encodeCategorical(vector);
  return Object.fromEntries(
    FEATURE_REGISTRY.filter(
      (definition) => definition.type !== "categorical",
    ).map((definition) => [definition.name, encoded[definition.name] ?? 0]),
  );
}
export function serializeFeatureVector(vector: FeatureVector): string {
  return JSON.stringify({
    version: vector.version,
    features: Object.fromEntries(
      Object.entries(vector.features).sort(([a], [b]) => a.localeCompare(b)),
    ),
    categorical: Object.fromEntries(
      Object.entries(vector.categorical).sort(([a], [b]) => a.localeCompare(b)),
    ),
    missing: [...vector.missing].sort(),
    sourceAvailability: Object.fromEntries(
      Object.entries(vector.sourceAvailability).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
  });
}
