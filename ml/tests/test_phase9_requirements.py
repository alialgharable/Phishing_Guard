import json

import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import LogisticRegression

from ml.ensemble.calibration import ProbabilityCalibrator, ProbabilityRecord
from ml.ensemble.ensemble import CalibratedEnsemble
from ml.ensemble.metadata import build_phase9_metadata
from ml.evaluation.calibration import (
    calibration_metrics,
    expected_calibration_error,
    reliability_curve,
)
from ml.evaluation.calibration_report import build_calibration_report, write_calibration_report
from ml.models.baseline_logistic import BaselineLogistic
from ml.models.baseline_random_forest import BaselineRandomForest
from ml.models.baseline_xgboost import BaselineXGBoost
from ml.predictions.oof_predictions import generate_oof_predictions
from ml.training.config import TrainingConfig


class AuditedPreprocessor:
    def fit(self, frame, labels=None):
        self.fit_sample_ids = tuple(frame["sample_id"].tolist())
        return self

    def transform(self, frame):
        return frame[["value"]].astype(float)


def _records(model_name, values, labels, split="calibration"):
    return [ProbabilityRecord(f"s-{index}", model_name, value, label, split) for index, (value, label) in enumerate(zip(values, labels))]


def _oof_frame():
    return pd.DataFrame({
        "sample_id": [f"s-{index}" for index in range(12)],
        "value": np.linspace(0.1, 1.2, 12),
        "label": [0, 1] * 6,
        "domain": [f"domain-{index // 2}" for index in range(12)],
    })


def _factories():
    return {"logistic_regression": lambda: LogisticRegression(max_iter=200, random_state=42)}


def test_probability_interface():
    assert all(hasattr(model, "probability_records") for model in (
        BaselineLogistic(), BaselineRandomForest(), BaselineXGBoost(n_estimators=2)
    ))


def test_oof_predictions():
    result = generate_oof_predictions(_oof_frame(), _factories(), AuditedPreprocessor, n_splits=3, random_seed=42)
    assert len(result.predictions) == 12
    assert result.predictions["sample_id"].nunique() == 12
    assert set(result.predictions["split"]) == {"oof"}


def test_oof_training_exclusion():
    result = generate_oof_predictions(_oof_frame(), _factories(), AuditedPreprocessor, n_splits=3, random_seed=42)
    for audit in result.fold_audits:
        assert set(audit["train_sample_ids"]).isdisjoint(audit["held_out_sample_ids"])
        assert set(audit["preprocessor_fit_sample_ids"]) == set(audit["train_sample_ids"])


def test_domain_grouped_oof():
    result = generate_oof_predictions(
        _oof_frame(), _factories(), AuditedPreprocessor, strategy="domain_grouped", n_splits=3, random_seed=42
    )
    for audit in result.fold_audits:
        assert set(audit["train_domains"]).isdisjoint(audit["held_out_domains"])


def test_sigmoid_calibration():
    calibrator = ProbabilityCalibrator("sigmoid").fit([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])
    assert np.all((calibrator.transform([0.1, 0.9]) >= 0) & (calibrator.transform([0.1, 0.9]) <= 1))


def test_isotonic_calibration():
    calibrator = ProbabilityCalibrator("isotonic").fit([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])
    assert np.all(np.diff(calibrator.transform([0.1, 0.2, 0.8, 0.9])) >= 0)


def test_ensemble_mean():
    records = {
        name: _records(name, [0.2 + index * 0.1, 0.7], [0, 1])
        for index, name in enumerate(("logistic_regression", "random_forest", "xgboost"))
    }
    result = CalibratedEnsemble().combine_raw(records)
    assert result.loc[result["sample_id"] == "s-0", "raw_ensemble_probability"].item() == pytest.approx(0.3)


def test_calibrated_ensemble():
    records = {
        name: _records(name, [0.1, 0.9], [0, 1])
        for name in ("logistic_regression", "random_forest", "xgboost")
    }
    result = CalibratedEnsemble(method="isotonic").combine(records)
    assert {"raw_ensemble_probability", "calibrated_ensemble_probability"}.issubset(result.columns)
    assert "verdict" not in result.columns


def test_brier_score():
    assert calibration_metrics([0, 1], [0.2, 0.8])["brier_score"] == pytest.approx(0.04)


def test_log_loss():
    assert calibration_metrics([0, 1], [0.2, 0.8])["log_loss"] == pytest.approx(-np.log(0.8))


def test_reliability_curve():
    curve = reliability_curve([0, 1, 1], [0.05, 0.55, 0.95], bins=5)
    assert len(curve) == 5
    assert sum(item["sample_count"] for item in curve) == 3
    assert curve[1]["sample_count"] == 0
    assert curve[1]["mean_predicted_probability"] is None


def test_ece():
    assert expected_calibration_error([0, 1], [0.2, 0.8], bins=5) == pytest.approx(0.2)


def test_calibration_test_isolation():
    calibrator = ProbabilityCalibrator("sigmoid")
    with pytest.raises(ValueError, match="test"):
        calibrator.fit_records(_records("logistic_regression", [0.1, 0.9], [0, 1], split="test"))
    calibrator.fit_records(_records("logistic_regression", [0.1, 0.9], [0, 1], split="oof"))
    assert calibrator.fit_splits == ("oof", "oof")


def test_artifact_metadata(tmp_path):
    metadata = build_phase9_metadata(
        TrainingConfig(split_strategy="domain_grouped"),
        feature_schema_version="1.0.0",
        dataset_version="test.1",
        training_metadata={"sample_count": 12},
    )
    path = write_calibration_report(tmp_path / "report.json", [build_calibration_report("ensemble", "sigmoid", [0, 1], [0.2, 0.8], metadata=metadata)])
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload[0]["metadata"]["feature_schema_version"] == "1.0.0"
    assert payload[0]["metadata"]["ensemble_configuration"]["aggregation"] == "equal_mean"


def test_reproducibility():
    first = generate_oof_predictions(_oof_frame(), _factories(), AuditedPreprocessor, n_splits=3, random_seed=42).predictions
    second = generate_oof_predictions(_oof_frame(), _factories(), AuditedPreprocessor, n_splits=3, random_seed=42).predictions
    pd.testing.assert_frame_equal(first, second)
