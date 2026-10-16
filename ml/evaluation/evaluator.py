from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from ml.evaluation.metrics import compute_binary_metrics


def evaluate_model(model_path: str | Path, dataset_path: str | Path) -> dict:
    dataset = pd.read_csv(dataset_path)
    model_bundle = __import__("joblib").load(Path(model_path) / "model.joblib")
    X = dataset[[column for column in dataset.columns if column not in {"label", "sample_id", "url"}]].fillna(0)
    y_true = dataset["label"].astype(int)
    y_score = model_bundle.predict_proba(X)[:, 1]
    report = compute_binary_metrics(y_true, y_score)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate saved PhishGuard baseline models")
    parser.add_argument("--model", required=True, help="Path to model artifact directory")
    parser.add_argument("--dataset", required=True, help="Dataset CSV")
    args = parser.parse_args()
    report = evaluate_model(args.model, args.dataset)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
