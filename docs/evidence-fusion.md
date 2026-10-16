# Phase 10 Evidence Fusion

Phase 10 is the deterministic policy boundary between completed analysis layers and a user-facing risk state. `EvidenceFusionService` consumes already-produced analysis results. It performs no HTTP, DNS, RDAP, threat-intelligence, or browser requests.

## Evidence model

The shared `Evidence` contract is preserved and optionally enriched with:

- category: `URL`, `THREAT_INTELLIGENCE`, `DOMAIN`, `REDIRECT`, `CONTENT`, `BRAND`, or `ML`
- group: `URL_STRUCTURE`, `DOMAIN`, `THREAT_INTEL`, `REDIRECT`, `CONTENT_STRUCTURE`, `CREDENTIAL_COLLECTION`, `BRAND_IDENTITY`, `SOCIAL_ENGINEERING`, `MALWARE`, or `ML`
- bounded strength: `info`, `low`, `medium`, `high`, or `critical`
- source, title, description, and optional confidence

Fusion retains the original evidence descriptions and sources. It does not recreate or silently discard analyzer observations.

## Correlation control

Evidence is grouped before policy evaluation. Each group has a bounded contribution cap of 35. Therefore, related signals such as brand mismatch, brand keywords, login forms, password fields, and credential wording cannot overwhelm independent categories merely by appearing as many observations. Domain-age observations are similarly bounded within `DOMAIN`.

The numeric contribution is an explainable bounded policy aid for comparing groups, not a probability, model score, or universal phishing score. Stronger heuristic states also require independent categories and multiple strong observations.

## Direct threat handling

Threat-intelligence provider states remain distinct:

- `listed`
- `not_listed`
- `not_queried`
- `unavailable`
- `error`

A listed phishing result produces `KNOWN_PHISHING`. A listed malware result produces `KNOWN_MALWARE`. Other listed categories remain direct threat evidence but do not get mislabeled as phishing or malware. Provider failures, unavailable providers, and not-listed responses are retained for explanation and contribute zero malicious evidence.

## Risk states

The service returns one of:

- `KNOWN_MALWARE`: authoritative malware listing
- `KNOWN_PHISHING`: authoritative phishing listing
- `HIGH_RISK`: multiple independent categories and multiple strong observations satisfy the bounded policy
- `SUSPICIOUS`: meaningful evidence exists across independent categories but does not meet the high-risk policy
- `LOW_RISK`: a complete explicitly available assessment found no elevated indicators; this is not a safety guarantee
- `UNKNOWN`: evidence or analysis availability is insufficient for a useful stronger assessment

`LOW_RISK` is not inferred from a not-listed result. `UNKNOWN` is not malicious.

## ML integration

Phase 9 calibrated probability can be supplied as the `ML` category together with `modelVersion` and `calibrationMethod`. It is retained in the assessment as metadata and evidence. ML probability alone cannot produce `HIGH_RISK`, `KNOWN_PHISHING`, or `KNOWN_MALWARE`. If ML is unavailable, `available` is false and `ML unavailable` is included in uncertainty.

## Availability and uncertainty

The assessment tracks availability for URL, threat intelligence, domain, redirects, content, brand, and ML. Missing layers generate uncertainty messages such as `Domain analysis unavailable` or `Threat intelligence unavailable`. Unavailability contributes no malicious score.

## Contradictory evidence and explainability

Contradictory observations are retained together. For example, a not-listed threat-intelligence result, normal domain observation, credential collection, brand mismatch, and elevated ML probability all remain present in `evidence`, category summaries, and provider statuses. The result also contains a summary, explanation, category summaries, grouped observations, direct threat records, and uncertainty.

## Architecture and limitations

The flow is:

`analysis results -> EvidenceFusionService -> RiskAssessment`

Analyzers do not depend on the fusion service. The policy is deterministic for the same input. It is conservative and evidence-first, but it does not establish ground truth or replace analyst review.

The following statements are explicit policy invariants:

- `LOW_RISK` != guaranteed safe
- `UNKNOWN` != malicious
- `not_listed` != safe
- `HTTPS` != safe
- ML probability != final verdict
