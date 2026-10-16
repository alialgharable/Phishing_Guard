from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .calibration import calibration_metrics, discrimination_metrics, expected_calibration_error, reliability_curve


def build_calibration_report(
    model: str,
    method: str,
    y_true,
    probabilities,
    *,
    bins: int = 10,
    metadata: dict | None = None,
) -> dict:
    report = {
        "model": model,
        "calibration_method": method,
        "sample_count": int(len(y_true)),
        **calibration_metrics(y_true, probabilities),
        "ece": expected_calibration_error(y_true, probabilities, bins=bins),
        **discrimination_metrics(y_true, probabilities),
        "reliability_curve": reliability_curve(y_true, probabilities, bins=bins),
    }
    if metadata:
        report["metadata"] = metadata
    return report


def write_calibration_report(path: str | Path, reports: Iterable[dict]) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as handle:
        json.dump(list(reports), handle, indent=2, sort_keys=True)
    return target
