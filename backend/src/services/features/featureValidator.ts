import { FEATURE_REGISTRY } from "./featureRegistry";
import { FeatureValidationResult, FeatureVector } from "./types";

export function validateFeatureVector(
  vector: FeatureVector,
): FeatureValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const known = new Set(FEATURE_REGISTRY.map((definition) => definition.name));
  const registryNames = [...known];
  if (!vector.version) errors.push("Feature vector version is missing.");
  if (vector.version !== FEATURE_REGISTRY[0]?.version)
    errors.push(`Unsupported feature schema version: ${vector.version}.`);
  for (const definition of FEATURE_REGISTRY) {
    if (definition.type === "categorical") continue;
    const value = vector.features[definition.name];
    if (value === undefined) {
      errors.push(`Missing feature: ${definition.name}.`);
      continue;
    }
    if (!Number.isFinite(value))
      errors.push(`Feature ${definition.name} is not finite.`);
    if (definition.min !== undefined && value < definition.min)
      errors.push(`Feature ${definition.name} is below its minimum.`);
    if (definition.max !== undefined && value > definition.max)
      errors.push(`Feature ${definition.name} is above its maximum.`);
    if (definition.type === "numeric" && value < 0)
      errors.push(`Feature ${definition.name} cannot be negative.`);
  }
  for (const name of Object.keys(vector.features))
    if (!known.has(name)) errors.push(`Unexpected feature: ${name}.`);
  for (const name of vector.missing)
    if (!known.has(name))
      warnings.push(`Missing list references unknown feature: ${name}.`);
  const categoricalDefinitions = FEATURE_REGISTRY.filter(
    (definition) => definition.type === "categorical",
  );
  for (const definition of categoricalDefinitions)
    if (
      vector.categorical[definition.name] === undefined &&
      !vector.missing.includes(definition.name)
    )
      warnings.push(`Categorical feature ${definition.name} is absent.`);
  if (new Set(registryNames).size !== registryNames.length)
    errors.push("Feature registry contains duplicate names.");
  return { valid: errors.length === 0, errors, warnings };
}
