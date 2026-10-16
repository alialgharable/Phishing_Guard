from __future__ import annotations

from collections.abc import Mapping

import pandas as pd

from .calibration import ProbabilityCalibrator, ProbabilityRecord


class CalibratedEnsemble:
    """Combine calibrated model outputs into an experimental ensemble score.

    This layer intentionally produces a calibrated score only. It does not create
    a final phishing verdict or a user-facing threshold decision.
    """

    def __init__(self, method: str = "sigmoid", weights: Mapping[str, float] | None = None):
        self.method = method
        if weights and len(set(float(value) for value in weights.values())) != 1:
            raise ValueError("Phase 9 ensemble uses an equal-weight mean; optimized weights are not supported.")
        self.model_names = tuple(weights.keys()) if weights else ()
        self.calibrators: dict[str, ProbabilityCalibrator] = {}

    def fit(self, records_by_model: Mapping[str, list[ProbabilityRecord]]) -> "CalibratedEnsemble":
        self.calibrators = {}
        for model_name, records in records_by_model.items():
            if not records:
                continue
            calibrator = ProbabilityCalibrator(method=self.method)
            calibrator.fit_records(records)
            self.calibrators[model_name] = calibrator
        if not self.model_names:
            self.model_names = tuple(records_by_model.keys())
        return self

    def fit_calibrators(self, calibration_records_by_model: Mapping[str, list[ProbabilityRecord]]) -> "CalibratedEnsemble":
        return self.fit(calibration_records_by_model)

    @staticmethod
    def _raw_score(records_by_model: Mapping[str, list[ProbabilityRecord]], sample_id: object) -> float | None:
        scores = []
        for records in records_by_model.values():
            match = next((record for record in records if record.sample_id == sample_id), None)
            if match is not None:
                scores.append(float(match.raw_probability))
        return sum(scores) / len(scores) if scores else None

    def combine_raw(self, records_by_model: Mapping[str, list[ProbabilityRecord]]) -> pd.DataFrame:
        sample_ids = sorted({record.sample_id for records in records_by_model.values() for record in records})
        rows = []
        for sample_id in sample_ids:
            score = self._raw_score(records_by_model, sample_id)
            if score is not None:
                rows.append({"sample_id": sample_id, "raw_ensemble_probability": score})
        return pd.DataFrame(rows, columns=["sample_id", "raw_ensemble_probability"])

    def combine(self, records_by_model: Mapping[str, list[ProbabilityRecord]]) -> pd.DataFrame:
        if not records_by_model:
            return pd.DataFrame(columns=["sample_id", "combined_probability"])

        if not self.calibrators:
            self.fit(records_by_model)

        sample_ids = sorted({record.sample_id for records in records_by_model.values() for record in records})
        rows = []
        for sample_id in sample_ids:
            calibrated_scores = []
            for model_name, records in records_by_model.items():
                match = next((record for record in records if record.sample_id == sample_id), None)
                if match is None:
                    continue
                calibrator = self.calibrators.get(model_name)
                if calibrator is None:
                    continue
                score = float(calibrator.transform([match.raw_probability])[0])
                calibrated_scores.append(score)

            raw_score = self._raw_score(records_by_model, sample_id)
            if not calibrated_scores or raw_score is None:
                continue
            rows.append(
                {
                    "sample_id": sample_id,
                    "raw_ensemble_probability": raw_score,
                    "calibrated_ensemble_probability": sum(calibrated_scores) / len(calibrated_scores),
                    "combined_probability": sum(calibrated_scores) / len(calibrated_scores),
                }
            )

        result = pd.DataFrame(rows, columns=[
            "sample_id", "raw_ensemble_probability", "calibrated_ensemble_probability", "combined_probability"
        ])
        return result
