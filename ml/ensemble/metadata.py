from __future__ import annotations

from dataclasses import asdict
from typing import Any

from ml.training.config import TrainingConfig


def build_phase9_metadata(
    config: TrainingConfig,
    *,
    feature_schema_version: str,
    dataset_version: str,
    training_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build non-sensitive, reproducible metadata for calibration artifacts."""
    return {
        "model_version": config.model_version,
        "feature_schema_version": feature_schema_version,
        "dataset_version": dataset_version,
        "split_strategy": config.split_strategy,
        "random_seed": config.random_seed,
        "calibration_method": config.calibration_method,
        "calibration_configuration": {
            "bins": config.calibration_bins,
            "oof_folds": config.oof_folds,
        },
        "model_names": list(config.model_names),
        "ensemble_configuration": {"aggregation": "equal_mean"},
        "training_metadata": training_metadata or {},
    }
