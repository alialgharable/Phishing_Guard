from __future__ import annotations

import numpy as np
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score, average_precision_score


def _validate_inputs(y_true, probabilities):
    labels = np.asarray(y_true, dtype=int).reshape(-1)
    scores = np.asarray(probabilities, dtype=float).reshape(-1)
    if len(labels) != len(scores) or len(labels) == 0:
        raise ValueError("labels and probabilities must be non-empty and equally sized.")
    if np.any((scores < 0) | (scores > 1)):
        raise ValueError("probabilities must be within [0, 1].")
    return labels, scores


def calibration_metrics(y_true, probabilities) -> dict[str, float]:
    labels, scores = _validate_inputs(y_true, probabilities)
    return {
        "brier_score": float(brier_score_loss(labels, scores)),
        "log_loss": float(log_loss(labels, scores, labels=[0, 1])),
    }


def reliability_curve(y_true, probabilities, bins: int = 10) -> list[dict[str, float | int | None]]:
    labels, scores = _validate_inputs(y_true, probabilities)
    if bins not in {5, 10, 20} and bins < 1:
        raise ValueError("bins must be a positive integer; 5, 10, and 20 are supported defaults.")
    edges = np.linspace(0.0, 1.0, bins + 1)
    result = []
    for index in range(bins):
        lower, upper = float(edges[index]), float(edges[index + 1])
        mask = (scores >= lower) & ((scores < upper) if index < bins - 1 else (scores <= upper))
        count = int(mask.sum())
        result.append(
            {
                "bin_lower": lower,
                "bin_upper": upper,
                "sample_count": count,
                "mean_predicted_probability": float(scores[mask].mean()) if count else None,
                "observed_positive_rate": float(labels[mask].mean()) if count else None,
            }
        )
    if sum(int(item["sample_count"]) for item in result) != len(scores):
        raise AssertionError("Reliability bins must account for every sample.")
    return result


def expected_calibration_error(y_true, probabilities, bins: int = 10) -> float:
    labels, scores = _validate_inputs(y_true, probabilities)
    curve = reliability_curve(labels, scores, bins=bins)
    total = len(scores)
    return float(
        sum(
            (int(item["sample_count"]) / total)
            * abs(float(item["mean_predicted_probability"]) - float(item["observed_positive_rate"]))
            for item in curve
            if int(item["sample_count"]) > 0
        )
    )


def discrimination_metrics(y_true, probabilities) -> dict[str, float | None]:
    labels, scores = _validate_inputs(y_true, probabilities)
    return {
        "roc_auc": float(roc_auc_score(labels, scores)) if len(np.unique(labels)) == 2 else None,
        "pr_auc": float(average_precision_score(labels, scores)) if len(np.unique(labels)) == 2 else None,
    }
