from __future__ import annotations

import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


class BaselineLogistic:
    def __init__(self, random_state: int = 42, max_iter: int = 300, class_weight: str | None = "balanced"):
        self.random_state = random_state
        self.max_iter = max_iter
        self.class_weight = class_weight
        self.pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("model", LogisticRegression(
                    max_iter=max_iter,
                    class_weight=class_weight,
                    random_state=random_state,
                )),
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
        return predict_probability_records(self, X, sample_ids, true_labels, "logistic_regression", split)
