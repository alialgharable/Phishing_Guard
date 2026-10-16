# PhishGuard ML Training

This document describes the experimental Phase 8 and Phase 9 machine-learning pipeline. It intentionally does not create a production phishing verdict.

## Dataset schema

The dataset schema uses a target label field:

- `0` = benign
- `1` = phishing or malicious

The label is the target and must not be included in the feature vector.

## Provenance

Every imported dataset should retain provenance metadata such as:

- `source_name`
- `source_url_or_identifier`
- `retrieved_at`
- `dataset_version`
- `license`
- `label_definition`

If the source is unknown, the value is represented as `unknown`.

## Feature schema

The Python layer reads the exported Phase 7 registry from the TypeScript backend. This keeps the ML schema aligned with the feature registry and avoids silent divergence.

## Split strategies

Supported strategies include:

- `domain_grouped` — keeps a registrable domain in a single split to reduce leakage
- `random` — standard stratified random split
- `temporal` — older samples train before newer data, when date metadata is available

## Leakage prevention

The default strategy is domain grouped to avoid training and testing with near-duplicate domains. The pipeline also supports duplicate removal and grouping.

## Baseline models

The baseline model set includes:

- logistic regression
- random forest
- XGBoost

None of these are production classifiers. Results are experimental only.

## Phase 9: probability, OOF, and calibration

Phase 9 consumes model outputs rather than introducing a second feature set. Each baseline model exposes a common probability-record interface containing `sample_id`, `model_name`, `raw_probability`, `true_label`, and `split`.

### Out-of-fold predictions

`ml/predictions/oof_predictions.py` trains a fresh model for each fold and emits exactly one held-out probability per sample and model. A fresh feature preprocessor is fitted inside each fold using training rows only, then applied to the held-out rows. The supported strategies are `random`, `temporal`, and `domain_grouped`. Domain-grouped folds use `StratifiedGroupKFold`, so the domain sets on the training and held-out sides are disjoint.

OOF scores are suitable for fitting calibration parameters without fitting on the final test set. Fold audits record training IDs, held-out IDs, domains, and preprocessor fit IDs for leakage tests.

`ml/training/phase9.py` provides the executable orchestration: it generates TRAIN OOF scores, fits calibrators from those OOF records, refits models on TRAIN, and evaluates validation and final TEST records without passing TEST labels into calibration fitting.

### Calibration-data separation

The intended flow is:

`TRAIN -> OOF model scores -> calibration fitting -> validation evaluation -> final test evaluation`

`ProbabilityCalibrator.fit_records` rejects records marked `test`. It supports `sigmoid` (Platt-style logistic calibration) and `isotonic`; selecting one method never silently substitutes the other. Isotonic regression can overfit or become stepwise with small calibration sets, so its output is experimental and should be interpreted cautiously.

### Ensemble averaging

The ensemble consumes logistic regression, random forest, and XGBoost probability outputs. Its raw score is an equal-weight arithmetic mean. Calibrated ensemble output is kept in a separate field. Weight optimization, test-based weight selection, model ranking, and winner selection are intentionally unsupported.

### Calibration diagnostics

The calibration diagnostics include Brier score, log loss, ROC-AUC, PR-AUC, reliability curves, and expected calibration error (ECE). Reliability curves support configurable bins, including 5, 10, and 20 bins. Every sample belongs to one bin; empty bins are represented explicitly with `sample_count: 0` and null means.

For bins $B_k$, ECE is calculated as:

$$
\mathrm{ECE} = \sum_{k=1}^{K} \frac{|B_k|}{n} \left|\operatorname{mean}_{i \in B_k}(p_i) - \operatorname{mean}_{i \in B_k}(y_i)\right|
$$

ECE is a diagnostic summary, not an absolute measure of model quality and not a production threshold-selection mechanism. Machine-readable reports contain the model, calibration method, sample count, Brier score, log loss, ECE, ROC-AUC, PR-AUC, and reliability-curve bins. Artifact metadata records model/schema/dataset versions, split strategy, seed, calibration configuration, model names, ensemble configuration, and training metadata without storing credentials or page content.

## Reproducibility

Model training records version information, dataset metadata, split seed, and training configuration. The pipeline is designed to be reproducible under a consistent environment and dataset.

## Limitations

The current ML layer is intended for dataset validation, baseline experimentation, and probability calibration research only. Small calibration sets, especially for isotonic regression, can produce unstable or overfit mappings. Calibration scores are not ground truth, do not claim real-world phishing performance, and do not choose a final phishing threshold or verdict.
