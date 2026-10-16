import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_REGISTRY } from "../src/services/features/featureRegistry";
import { FEATURE_SCHEMA_VERSION } from "../src/services/features/featureVersion";

const payload = {
  version: FEATURE_SCHEMA_VERSION,
  features: FEATURE_REGISTRY.map((definition) => ({
    name: definition.name,
    type: definition.type,
    description: definition.description,
    source: definition.source,
    nullable: definition.nullable,
    version: definition.version,
    min: definition.min ?? null,
    max: definition.max ?? null,
  })),
};

const outputPath = resolve(
  __dirname,
  "../../ml/features/feature_registry.json",
);
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
console.log(`Wrote ${outputPath} with ${FEATURE_REGISTRY.length} features.`);
