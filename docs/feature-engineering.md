Z# PhishGuard Feature Engineering

## Scope

Phase 7 converts completed Phase 1-6 analysis results into a deterministic, versioned, ML-ready representation. It does not fetch data, train models, assign weights, calculate scores, or produce classifications.

## Schema

The current schema version is `1.0.0`. The authoritative feature order and metadata are in `backend/src/services/features/featureRegistry.ts`.

`FeatureVector` contains:

- `version`: schema version
- `features`: numeric and boolean observations, with booleans encoded as `0` or `1`
- `categorical`: categorical values such as `page_identity`
- `missing`: names whose source value was unavailable or unknown
- `sourceAvailability`: whether each Phase 1-6 source was available

All feature names use `snake_case`.

## Groups

The registry includes URL and lexical, Unicode/IDN, brand, domain/DNS, threat-intelligence, redirect, content, resource-ratio, login, wording, favicon, and domain-relationship features.

Counts are retained as observations. Similarities are bounded to `[0, 1]`. Resource ratios are bounded to `[0, 1]`. Domain age also has a `log1p` representation when known.

## Missing data

Unknown is not zero. Optional numeric values use `0` for serialization compatibility only when their feature name is also present in `missing`. A provider that was not queried is not represented as a negative listing. DNS failure is not represented as an empty successful lookup.

## Serialization

`toFeatureArray()` follows registry order and excludes categorical fields for numeric model input. `featureVectorToRow()` produces a numeric row keyed by registry order. `serializeFeatureVector()` produces stable JSON with sorted object keys.

## Leakage rules

The extractor accepts observations only. It does not include final labels, analyst decisions, risk scores, predictions, probabilities, or evidence-fusion outcomes. Threat-intelligence provider observations such as `urlhaus_listed` are allowed, while aggregate final verdicts are not.

## Example

```json
{
  "version": "1.0.0",
  "features": {
    "url_length": 42,
    "protocol_is_https": 1,
    "domain_age_days": 0,
    "domain_age_known": 0,
    "password_field_count": 1
  },
  "categorical": { "page_identity": "login" },
  "missing": ["domain_age_days", "domain_age_log"],
  "sourceAvailability": {
    "url": true,
    "threat_intelligence": false,
    "domain": true,
    "redirects": false,
    "content": true,
    "brand": true
  }
}
```

No Phase 7 threshold or phishing decision exists.
