from __future__ import annotations

from collections.abc import Callable

import pandas as pd

from ml.ensemble.ensemble import CalibratedEnsemble
from ml.evaluation.calibration_report import build_calibration_report
from ml.predictions.oof_predictions import generate_oof_predictions
from ml.predictions.probability_predictions import predict_probability_records
from ml.training.config import TrainingConfig


def run_phase9_experiment(
    train_frame: pd.DataFrame,
    validation_frame: pd.DataFrame,
    test_frame: pd.DataFrame,
    model_factories: dict[str, Callable[[], object]],
    feature_preprocessor_factory: Callable[[], object],
    config: TrainingConfig | None = None,
) -> dict[str, object]:
    """Run the leakage-aware experimental Phase 9 flow.

    OOF records from TRAIN fit the calibrators. Models are then refit on TRAIN
    for validation and final held-out TEST scoring. TEST labels are never passed
    to calibration fitting.
    """
    config = config or TrainingConfig()
    oof = generate_oof_predictions(
        train_frame,
        model_factories,
        feature_preprocessor_factory,
        strategy=config.split_strategy,
        n_splits=config.oof_folds,
        random_seed=config.random_seed,
    )
    oof_records = {
        model_name: [
            _record_from_row(row)
            for _, row in oof.predictions[oof.predictions["model_name"] == model_name].iterrows()
        ]
        for model_name in model_factories
    }
    ensemble = CalibratedEnsemble(method=config.calibration_method)
    ensemble.fit_calibrators(oof_records)

    fitted_preprocessor = feature_preprocessor_factory()
    fitted_preprocessor.fit(train_frame.drop(columns=["label"], errors="ignore"), train_frame["label"])
    train_X = fitted_preprocessor.transform(train_frame.drop(columns=["label"], errors="ignore"))
    validation_X = fitted_preprocessor.transform(validation_frame.drop(columns=["label"], errors="ignore"))
    test_X = fitted_preprocessor.transform(test_frame.drop(columns=["label"], errors="ignore"))

    evaluation_records: dict[str, dict[str, list]] = {"validation": {}, "test": {}}
    for model_name, factory in model_factories.items():
        model = factory()
        model.fit(train_X, train_frame["label"].astype(int))
        evaluation_records["validation"][model_name] = predict_probability_records(
            model, validation_X, validation_frame["sample_id"], validation_frame["label"], model_name, "validation"
        )
        evaluation_records["test"][model_name] = predict_probability_records(
            model, test_X, test_frame["sample_id"], test_frame["label"], model_name, "test"
        )

    reports = []
    ensemble_outputs = {}
    for split, records_by_model in evaluation_records.items():
        for model_name, records in records_by_model.items():
            probabilities = [record.raw_probability for record in records]
            labels = [record.true_label for record in records]
            calibrated = ensemble.calibrators[model_name].transform(probabilities)
            reports.append(build_calibration_report(model_name, config.calibration_method, labels, calibrated, bins=config.calibration_bins))
        combined = ensemble.combine(records_by_model)
        ensemble_outputs[split] = combined
        labels = test_frame["label"].tolist() if split == "test" else validation_frame["label"].tolist()
        reports.append(build_calibration_report(
            "ensemble",
            config.calibration_method,
            labels,
            combined["calibrated_ensemble_probability"].tolist(),
            bins=config.calibration_bins,
        ))

    return {
        "oof_predictions": oof.predictions,
        "oof_fold_audits": oof.fold_audits,
        "calibrated_ensemble": ensemble,
        "evaluation_records": evaluation_records,
        "ensemble_outputs": ensemble_outputs,
        "reports": reports,
    }


def _record_from_row(row):
    from ml.ensemble.calibration import ProbabilityRecord

    return ProbabilityRecord(
        sample_id=row["sample_id"],
        model_name=row["model_name"],
        raw_probability=float(row["raw_probability"]),
        true_label=int(row["true_label"]),
        split=row["split"],
    )
