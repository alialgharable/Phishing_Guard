# Phase 11 Evaluation and Validation

Phase 11 evaluates PhishGuard behavior without optimizing the final test set or claiming real-world accuracy. Reports are diagnostic and retain uncertainty.

## Dataset contract

Evaluation datasets support `sample_id`, `url`, `label`, `domain`, `page_identity`, `collection_date`, and `source`. Labels are normalized to `benign`, `phishing`, `malware`, or `unknown`. Unknown and unverified samples are preserved and are never silently converted to benign.

`ml/evaluation/dataset_quality.py` reports missing and malformed URLs, duplicate URLs, duplicate feature rows, duplicate domains, conflicting labels, missing/unknown labels, invalid dates, and label counts.

## Splits and leakage

The existing splitter supports random, domain-grouped, and temporal strategies. Every evaluation report must record the strategy. `validate_split_leakage` checks sample IDs, normalized URLs, domain overlap for grouped splits, and chronological violations for temporal splits.

Random splitting is suitable only for basic experimentation. Domain-grouped splitting prevents shared domains across partitions. Temporal splitting trains on older collection dates and evaluates on newer dates.

## Metrics

Binary model diagnostics include precision, recall, F1, accuracy, ROC-AUC, PR-AUC, false-positive rate, false-negative rate, log loss, confusion matrix, TP, TN, FP, and FN. False positives are reported prominently for diagnosis, but metrics do not select a production threshold.

Phase 10 risk-state reports count:

- `KNOWN_MALWARE`
- `KNOWN_PHISHING`
- `HIGH_RISK`
- `SUSPICIOUS`
- `LOW_RISK`
- `UNKNOWN`

`LOW_RISK` is not assumed to mean benign, and `UNKNOWN` is not assumed to mean malicious.

## Hard negatives and error analysis

The hard-negative detector identifies difficult benign-style cases including login/password wording, long URLs, many subdomains, redirects, JavaScript, external resources, cloud/CDN references, and brand-related wording. These records are diagnostic regression candidates; findings do not automatically change fusion policy or model weights.

False-positive and false-negative reports identify available evidence categories, missing analysis layers, contradictions, weak signals, and incorrectly interpreted observations where those fields are present.

## Calibration

Phase 9 calibration diagnostics are reused for Brier score, log loss, reliability curves, ECE, ROC-AUC, and PR-AUC. Calibrated and uncalibrated probabilities may be compared descriptively. Calibration is not claimed to be scientifically optimal and probability is not ground truth.

## Reports and limitations

Machine-readable reports are written under `ml/reports/` with names such as `dataset-quality.json`, `evaluation-summary.json`, `confusion-matrix.json`, `calibration.json`, `hard-negatives.json`, and `error-analysis.json`. The report writer does not fabricate unavailable measurements.

Synthetic and small repository datasets cannot establish production performance. Evaluation results depend on label quality, provenance, temporal coverage, domain diversity, duplicate policy, unavailable analysis layers, and the distinction between unknown and benign.
