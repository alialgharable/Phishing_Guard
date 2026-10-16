from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TrainingConfig:
    random_seed: int = 42
    test_size: float = 0.15
    validation_size: float = 0.15
    split_strategy: str = "domain_grouped"
    model_names: list[str] = field(default_factory=lambda: ["logistic_regression", "random_forest", "xgboost"])
    dataset_path: str | None = None
    artifact_dir: str = "ml/models/artifacts"
    oof_folds: int = 5
    calibration_method: str = "sigmoid"
    calibration_bins: int = 10
    model_version: str = "phase9.1"

    def __post_init__(self) -> None:
        if self.split_strategy not in {"domain_grouped", "random", "temporal"}:
            raise ValueError("split_strategy must be random, temporal, or domain_grouped.")
        if self.calibration_method not in {"sigmoid", "isotonic"}:
            raise ValueError("calibration_method must be sigmoid or isotonic.")
        if self.oof_folds < 2:
            raise ValueError("oof_folds must be at least 2.")
        if self.calibration_bins < 1:
            raise ValueError("calibration_bins must be positive.")
