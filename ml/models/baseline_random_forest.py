from __future__ import annotations

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline


class BaselineRandomForest:
    def __init__(
        self,
        random_state: int = 42,
        n_estimators: int = 200,
        max_depth: int | None = 10,
        min_samples_leaf: int = 2,
    ):
        self.pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                (
                    "model",
                    RandomForestClassifier(
                        n_estimators=n_estimators,
                        max_depth=max_depth,
                        min_samples_leaf=min_samples_leaf,
                        random_state=random_state,
                        n_jobs=-1,
                    ),
                ),
            ]
        )

    def fit(self, X: pd.DataFrame, y):
        self.pipeline.fit(X, y)
        return self

    def predict(self, X: pd.DataFrame):
        return self.pipeline.predict(X)

    def predict_proba(self, X: pd.DataFrame):
        return self.pipeline.predict_proba(X)

    def probability_records(self, X, sample_ids, true_labels, split="evaluation"):
        from ml.predictions.probability_predictions import predict_probability_records
        return predict_probability_records(self, X, sample_ids, true_labels, "random_forest", split)
