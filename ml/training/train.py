from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ml.features.schema import FeatureSchema
from ml.models.baseline_logistic import BaselineLogistic
from ml.models.baseline_random_forest import BaselineRandomForest
from ml.models.baseline_xgboost import BaselineXGBoost
from ml.models.model_io import ModelArtifactWriter
from ml.preprocessing.dataset_cleaner import DatasetCleaner
from ml.preprocessing.deduplicator import Deduplicator, DuplicatePolicy
from ml.preprocessing.splitter import Splitter
from ml.training.config import TrainingConfig


def prepare_feature_matrix(frame: pd.DataFrame, schema: FeatureSchema) -> pd.DataFrame:
    data = frame.copy()
    for column in schema.numeric_feature_names:
        if column not in data.columns:
            data[column] = 0
    for column in schema.categorical_feature_names:
        if column in data.columns:
            value_set = sorted(data[column].dropna().unique().tolist())
            for value in value_set:
                data[f"{column}__{value}"] = (data[column] == value).astype(int)
    matrix = data[[name for name in schema.numeric_feature_names if name in data.columns]].copy()
    for name in schema.one_hot_feature_names:
        if name in data.columns:
            matrix[name] = data[name].astype(float)
    matrix = matrix.fillna(0)
    return matrix


def _save_metadata(path: Path, config: TrainingConfig, schema: FeatureSchema, data: pd.DataFrame) -> None:
    manifest = {
        "dataset_name": "synthetic-dev",
        "dataset_version": "0.1.0",
        "source": "synthetic",
        "collection_date": datetime.now(timezone.utc).isoformat(),
        "row_count": int(len(data)),
        "benign_samples": int((data["label"] == 0).sum()),
        "malicious_samples": int((data["label"] == 1).sum()),
        "feature_schema_version": schema.version,
        "label_definition": "0 = benign; 1 = phishing/malicious",
        "license": "unknown",
        "preprocessing_version": "0.1.0",
        "split_strategy": config.split_strategy,
        "random_seed": config.random_seed,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)


def train_models(dataset_path: str | Path, config: TrainingConfig | None = None):
    config = config or TrainingConfig()
    schema = FeatureSchema()
    raw = pd.read_csv(dataset_path)
    cleaner = DatasetCleaner(schema=schema)
    cleaned = cleaner.validate_and_clean(raw)
    data = cleaned["data"].copy()
    deduplicator = Deduplicator(policy=DuplicatePolicy())
    data = deduplicator.deduplicate(data)
    splitter = Splitter(random_seed=config.random_seed, strategy=config.split_strategy)
    train_df, val_df, test_df = splitter.split(data)

    train_X = prepare_feature_matrix(train_df, schema)
    train_y = train_df["label"].astype(int)
    test_X = prepare_feature_matrix(test_df, schema)
    test_y = test_df["label"].astype(int)

    results = {}
    for model_name in config.model_names:
        if model_name == "logistic_regression":
            model = BaselineLogistic(random_state=config.random_seed)
        elif model_name == "random_forest":
            model = BaselineRandomForest(random_state=config.random_seed)
        elif model_name == "xgboost":
            model = BaselineXGBoost(random_state=config.random_seed)
        else:
            continue
        model.fit(train_X, train_y)
        prob = model.predict_proba(test_X)[:, 1]
        results[model_name] = {"model": model, "probability": prob, "truth": test_y}

    manifest_path = Path("ml/data/manifests") / "training_manifest.json"
    _save_metadata(manifest_path, config, schema, data)
    artifact_dir = Path(config.artifact_dir)
    writer = ModelArtifactWriter(artifact_dir)
    for name, payload in results.items():
        writer.save(name, payload["model"], {"schema_version": schema.version, "model_name": name})

    return results, manifest_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Train PhishGuard baseline models")
    parser.add_argument("--dataset", required=True, help="Input dataset CSV file")
    parser.add_argument("--strategy", default="domain_grouped", choices=["domain_grouped", "random", "temporal"])
    args = parser.parse_args()
    config = TrainingConfig(dataset_path=args.dataset, split_strategy=args.strategy)
    results, manifest = train_models(args.dataset, config)
    print(f"Training complete. Manifest: {manifest}")
    print(f"Models trained: {', '.join(results.keys())}")


if __name__ == "__main__":
    main()
