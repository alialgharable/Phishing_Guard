from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.isotonic import IsotonicRegression


@dataclass(frozen=True)
class ProbabilityRecord:
    """Experimental score emitted by a model for a single observation.

    This intentionally represents a model score, not a final phishing verdict.
    The value is still probability-like and must be treated as evidence rather
    than a definitive class label.
    """

    sample_id: str | int
    model_name: str
    raw_probability: float
    true_label: int
    split: str = "validation"

    def __post_init__(self) -> None:
        probability = float(self.raw_probability)
        if not 0.0 <= probability <= 1.0:
            raise ValueError("raw_probability must be within [0, 1].")
        if int(self.true_label) not in {0, 1}:
            raise ValueError("true_label must be 0 or 1 for the experimental ML contract.")

    def as_dict(self) -> dict[str, object]:
        return {
            "sample_id": self.sample_id,
            "model_name": self.model_name,
            "raw_probability": self.raw_probability,
            "true_label": self.true_label,
            "split": self.split,
        }


class ProbabilityCalibrator:
    """Fit a simple calibration model on raw probability-like model outputs.

    The calibration stage is intentionally limited to post-processing model scores.
    It does not create a final decision threshold or verdict layer.
    """

    def __init__(self, method: str = "sigmoid", random_state: int = 42):
        method = method.lower()
        if method not in {"sigmoid", "isotonic"}:
            raise ValueError("method must be one of {'sigmoid', 'isotonic'}.")
        self.method = method
        self.random_state = random_state
        self.model = None
        self.fit_sample_ids: tuple[str | int, ...] = ()
        self.fit_splits: tuple[str, ...] = ()

    def fit(self, raw_scores: Sequence[float] | np.ndarray, labels: Sequence[int] | np.ndarray) -> "ProbabilityCalibrator":
        scores = np.asarray(raw_scores, dtype=float).reshape(-1)
        targets = np.asarray(labels, dtype=int).reshape(-1)
        if scores.shape[0] != targets.shape[0]:
            raise ValueError("raw_scores and labels must have equal lengths.")
        if scores.shape[0] == 0:
            raise ValueError("At least one observation is required to fit a calibrator.")
        if len(np.unique(targets)) < 2:
            raise ValueError("Calibration fitting requires both binary classes.")

        if self.method == "sigmoid":
            self.model = LogisticRegression(max_iter=1000, random_state=self.random_state)
            self.model.fit(scores.reshape(-1, 1), targets)
        else:
            self.model = IsotonicRegression(out_of_bounds="clip")
            self.model.fit(scores, targets)
        return self

    def fit_records(self, records: Sequence[ProbabilityRecord]) -> "ProbabilityCalibrator":
        """Fit only from OOF/calibration records, never final test records."""
        if not records:
            raise ValueError("At least one calibration record is required.")
        if any(record.split == "test" for record in records):
            raise ValueError("Final test records must not be used to fit calibration parameters.")
        self.fit(
            [record.raw_probability for record in records],
            [record.true_label for record in records],
        )
        self.fit_sample_ids = tuple(record.sample_id for record in records)
        self.fit_splits = tuple(record.split for record in records)
        return self

    def transform(self, raw_scores: Sequence[float] | np.ndarray) -> np.ndarray:
        if self.model is None:
            raise ValueError("ProbabilityCalibrator must be fitted before transform().")

        scores = np.asarray(raw_scores, dtype=float).reshape(-1)
        if self.method == "sigmoid":
            calibrated = self.model.predict_proba(scores.reshape(-1, 1))[:, 1]
        else:
            calibrated = self.model.predict(scores)
        return np.clip(calibrated, 0.0, 1.0)

    def calibrate_records(
        self,
        records: Iterable[ProbabilityRecord],
    ) -> list[dict[str, object]]:
        raw_scores = [float(record.raw_probability) for record in records]
        calibrated_scores = self.transform(raw_scores)
        results: list[dict[str, object]] = []
        for record, calibrated in zip(records, calibrated_scores):
            payload = record.as_dict()
            payload["calibrated_probability"] = float(calibrated)
            results.append(payload)
        return results
