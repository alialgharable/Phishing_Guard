# PhishGuard ML Pipeline

This directory contains the experimental machine-learning pipeline for PhishGuard.

The goal is to establish a reproducible baseline workflow without introducing a production verdict or thresholding policy. The pipeline is intentionally evidence-first and dataset-science oriented.

## Contents

- `features/` — feature schema generation and compatibility validation
- `preprocessing/` — cleaning, deduplication, and splitting
- `models/` — logistic regression, random forest, and XGBoost baselines
- `ensemble/` — experimental calibration and ensemble layer that combines model score outputs without creating a final verdict
- `training/` — reproducible training configuration and CLI
- `evaluation/` — metrics and comparison reports
- `data/` — raw/processed/split dataset storage

## Important guardrails

- No final phishing verdict is generated here.
- The ensemble layer produces calibrated probability-like scores only; it does not create a user-facing verdict or production threshold.
- Threshold optimization belongs to a later calibration phase.
- The label remains the target and never enters the feature vector.
- The feature schema is generated from the Phase 7 TypeScript registry.
