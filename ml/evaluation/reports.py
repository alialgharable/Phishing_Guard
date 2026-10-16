from __future__ import annotations

from typing import Iterable

import pandas as pd


def dataset_quality_report(frame: pd.DataFrame) -> dict:
    data = frame.copy()
    report = {
        "total_samples": int(len(data)),
        "benign_samples": int((data.get("label") == 0).sum()) if "label" in data.columns else 0,
        "phishing_samples": int((data.get("label") == 1).sum()) if "label" in data.columns else 0,
        "duplicate_count": int(data.duplicated(subset=[col for col in ["url", "sample_id"] if col in data.columns], keep="first").sum()),
        "invalid_url_count": int(data.get("url", pd.Series([None] * len(data))).map(lambda value: not isinstance(value, str) or len(str(value).strip()) == 0).sum()),
        "missing_label_count": int(data.get("label", pd.Series([None] * len(data))).isna().sum()),
        "domain_count": int(data.get("domain").nunique()) if "domain" in data.columns else 0,
        "date_coverage": {
            "min": data.get("collection_date").min() if "collection_date" in data.columns else None,
            "max": data.get("collection_date").max() if "collection_date" in data.columns else None,
        },
    }
    return report


def feature_importance_report(model, feature_names: Iterable[str]) -> dict:
    names = list(feature_names)
    if hasattr(model, "feature_importances_"):
        values = model.feature_importances_
        ranking = sorted(zip(names, values), key=lambda item: item[1], reverse=True)
        return {"type": "model_importance", "ranking": [{"feature": name, "importance": float(value)} for name, value in ranking]}
    if hasattr(model, "coef_"):
        values = model.coef_.ravel() if hasattr(model.coef_, "ravel") else model.coef_
        ranking = sorted(zip(names, values), key=lambda item: abs(item[1]), reverse=True)
        return {"type": "coefficient", "ranking": [{"feature": name, "coefficient": float(value)} for name, value in ranking]}
    return {"type": "unsupported", "ranking": []}
