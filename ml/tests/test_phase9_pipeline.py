import pandas as pd

from ml.ensemble.calibration import ProbabilityCalibrator, ProbabilityRecord
from ml.ensemble.ensemble import CalibratedEnsemble


def test_probability_records_emit_common_probability_contract():
    record = ProbabilityRecord(
        sample_id="s-1",
        model_name="logistic_regression",
        raw_probability=0.91,
        true_label=1,
        split="validation",
    )

    assert record.sample_id == "s-1"
    assert record.model_name == "logistic_regression"
    assert 0.0 <= record.raw_probability <= 1.0
    assert record.true_label in {0, 1}
    assert record.split == "validation"


def test_probability_calibrator_returns_valid_probability_scores():
    raw = [0.05, 0.2, 0.8, 0.9]
    labels = [0, 0, 1, 1]

    calibrator = ProbabilityCalibrator(method="sigmoid")
    calibrator.fit(raw, labels)
    transformed = calibrator.transform(raw)

    assert len(transformed) == len(raw)
    assert all(0.0 <= value <= 1.0 for value in transformed)


def test_calibrated_ensemble_combines_model_outputs_without_verdicts():
    records = {
        "logistic_regression": [
            ProbabilityRecord("a", "logistic_regression", 0.2, 0, "validation"),
            ProbabilityRecord("b", "logistic_regression", 0.8, 1, "validation"),
        ],
        "random_forest": [
            ProbabilityRecord("a", "random_forest", 0.25, 0, "validation"),
            ProbabilityRecord("b", "random_forest", 0.75, 1, "validation"),
        ],
    }

    ensemble = CalibratedEnsemble()
    result = ensemble.combine(records)

    assert len(result) == 2
    assert all(0.0 <= value <= 1.0 for value in result["combined_probability"])
    assert "winner" not in result.columns
    assert "verdict" not in result.columns
