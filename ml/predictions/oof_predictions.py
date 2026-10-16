from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.model_selection import (
    KFold,
    StratifiedKFold,
    StratifiedGroupKFold,
    TimeSeriesSplit,
)

from ml.ensemble.calibration import ProbabilityRecord
from .probability_predictions import predict_probability_records


@dataclass
class OOFResult:
    predictions: pd.DataFrame
    fold_audits: list[dict[str, object]] = field(default_factory=list)


class _IdentityPreprocessor:
    def fit(self, frame: pd.DataFrame, labels=None):
        self.fit_sample_ids = tuple(frame.index.tolist())
        return self

    def transform(self, frame: pd.DataFrame) -> pd.DataFrame:
        return frame.copy()


def _fold_indices(frame: pd.DataFrame, strategy: str, n_splits: int, seed: int, label_column: str, domain_column: str):
    if strategy == "domain_grouped":
        if domain_column not in frame.columns:
            raise ValueError("domain_grouped OOF requires a domain column.")
        splitter = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
        return splitter.split(frame, frame[label_column], groups=frame[domain_column].astype(str))
    if strategy == "temporal":
        return TimeSeriesSplit(n_splits=n_splits).split(frame)
    if strategy == "random":
        splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=seed)
        return splitter.split(frame, frame[label_column])
    raise ValueError("strategy must be one of {'random', 'temporal', 'domain_grouped'}.")


def generate_oof_predictions(
    frame: pd.DataFrame,
    model_factories: dict[str, Callable[[], object]],
    feature_preprocessor_factory: Callable[[], object] | None = None,
    *,
    strategy: str = "random",
    n_splits: int = 5,
    random_seed: int = 42,
    sample_id_column: str = "sample_id",
    label_column: str = "label",
    domain_column: str = "domain",
) -> OOFResult:
    """Generate one held-out prediction per row for every requested model.

    The preprocessor is instantiated and fitted inside each fold, before the
    model sees the training data. Its audit records make preprocessing leakage
    testable rather than implicit.
    """
    if frame.empty:
        raise ValueError("OOF input cannot be empty.")
    if frame[sample_id_column].duplicated().any():
        raise ValueError("OOF input sample IDs must be unique.")
    if frame[label_column].nunique() < 2:
        raise ValueError("OOF input must contain both labels.")

    data = frame.reset_index(drop=True).copy()
    all_rows: list[dict[str, object]] = []
    fold_audits: list[dict[str, object]] = []
    for fold, (train_indices, held_out_indices) in enumerate(
        _fold_indices(data, strategy, n_splits, random_seed, label_column, domain_column)
    ):
        train = data.iloc[train_indices]
        held_out = data.iloc[held_out_indices]
        train_ids = set(train[sample_id_column].tolist())
        held_out_ids = set(held_out[sample_id_column].tolist())
        if train_ids & held_out_ids:
            raise AssertionError("OOF training and held-out sample IDs overlap.")
        if strategy == "domain_grouped":
            train_domains = set(train[domain_column].astype(str))
            held_out_domains = set(held_out[domain_column].astype(str))
            if train_domains & held_out_domains:
                raise AssertionError("Domain-grouped OOF training and held-out domains overlap.")
        preprocessor = feature_preprocessor_factory() if feature_preprocessor_factory else _IdentityPreprocessor()
        preprocessor.fit(train.drop(columns=[label_column], errors="ignore"), train[label_column])
        train_X = preprocessor.transform(train.drop(columns=[label_column], errors="ignore"))
        held_out_X = preprocessor.transform(held_out.drop(columns=[label_column], errors="ignore"))
        fold_audits.append(
            {
                "fold": fold,
                "train_sample_ids": sorted(train_ids),
                "held_out_sample_ids": sorted(held_out_ids),
                "train_domains": sorted(set(train[domain_column].astype(str))) if domain_column in train else [],
                "held_out_domains": sorted(set(held_out[domain_column].astype(str))) if domain_column in held_out else [],
                "preprocessor_fit_sample_ids": sorted(getattr(preprocessor, "fit_sample_ids", train_ids)),
            }
        )
        for model_name, model_factory in model_factories.items():
            model = model_factory()
            model.fit(train_X, train[label_column].astype(int))
            records = predict_probability_records(
                model,
                held_out_X,
                held_out[sample_id_column].tolist(),
                held_out[label_column].astype(int).tolist(),
                model_name,
                "oof",
            )
            all_rows.extend(record.as_dict() | {"fold": fold} for record in records)

    predictions = pd.DataFrame(all_rows)
    expected = len(data) * len(model_factories)
    if len(predictions) != expected or predictions.duplicated(["sample_id", "model_name"]).any():
        raise AssertionError("OOF must produce exactly one prediction per sample and model.")
    return OOFResult(predictions=predictions, fold_audits=fold_audits)
