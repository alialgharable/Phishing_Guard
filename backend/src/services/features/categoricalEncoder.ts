import { FEATURE_REGISTRY } from "./featureRegistry";
import { FeatureVector } from "./types";

export function encodeCategorical(
  vector: FeatureVector,
): Record<string, number> {
  const encoded: Record<string, number> = { ...vector.features };
  for (const definition of FEATURE_REGISTRY) {
    if (definition.type !== "categorical") continue;
    const value = vector.categorical[definition.name];
    if (value !== undefined) encoded[`${definition.name}__${value}`] = 1;
  }
  return encoded;
}
