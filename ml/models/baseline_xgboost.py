from __future__ import annotations

import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier


class BaselineXGBoost:
    def __init__(
        self,
        random_state: int = 42,
        max_depth: int = 4,
        learning_rate: float = 0.05,
        n_estimators: int = 200,
        subsample: float = 0.9,
        colsample_bytree: float = 0.9,
    ):
        self.random_state = random_state
        self.pipeline = Pipeline(steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("model", XGBClassifier(
                n_estimators=n_estimators,
                max_depth=max_depth,
                learning_rate=learning_rate,
                subsample=subsample,
                colsample_bytree=colsample_bytree,
                random_state=random_state,
                objective="binary:logistic",
                eval_metric="logloss",
                use_label_encoder=False,
            )),
        ])

    def fit(self, X: pd.DataFrame, y):
        self.pipeline.fit(X, y)
        return self

    def predict(self, X: pd.DataFrame):
        return self.pipeline.predict(X)

    def predict_proba(self, X: pd.DataFrame):
        return self.pipeline.predict_proba(X)

    def probability_records(self, X, sample_ids, true_labels, split="evaluation"):
        from ml.predictions.probability_predictions import predict_probability_records
        return predict_probability_records(self, X, sample_ids, true_labels, "xgboost", split)
