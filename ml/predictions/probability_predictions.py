from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

from ml.ensemble.calibration import ProbabilityRecord


def records_from_predictions(
    sample_ids: Sequence[object],
    model_name: str,
    probabilities: Sequence[float],
    true_labels: Sequence[int],
    split: str,
) -> list[ProbabilityRecord]:
    if not (len(sample_ids) == len(probabilities) == len(true_labels)):
        raise ValueError("sample_ids, probabilities, and true_labels must have equal lengths.")
    return [
        ProbabilityRecord(
            sample_id=sample_id,
            model_name=model_name,
            raw_probability=float(probability),
            true_label=int(label),
            split=split,
        )
        for sample_id, probability, label in zip(sample_ids, probabilities, true_labels)
    ]


def predict_probability_records(
    model,
    X: pd.DataFrame,
    sample_ids: Sequence[object],
    true_labels: Sequence[int],
    model_name: str,
    split: str,
) -> list[ProbabilityRecord]:
    probabilities = np.asarray(model.predict_proba(X))[:, 1]
    return records_from_predictions(sample_ids, model_name, probabilities, true_labels, split)
