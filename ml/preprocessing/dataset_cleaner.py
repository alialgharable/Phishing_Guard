from __future__ import annotations

from urllib.parse import urlsplit

import pandas as pd

from ml.features.schema import FeatureSchema


class DatasetCleaner:
    def __init__(self, schema: FeatureSchema):
        self.schema = schema

    @staticmethod
    def _safe_domain(url: str | None) -> str | None:
        if not url:
            return None
        try:
            parsed = urlsplit(str(url))
            host = parsed.hostname or ""
            return host.lower() if host else None
        except Exception:
            return None

    @staticmethod
    def _coerce_label(value):
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"0", "1"}:
                return int(normalized)
            return None
        if isinstance(value, (int, float)) and value in {0, 1}:
            return int(value)
        return None

    def _populate_feature_columns(self, data: pd.DataFrame) -> pd.DataFrame:
        populated = data.copy()
        for feature_name in self.schema.numeric_feature_names:
            if feature_name not in populated.columns:
                populated[feature_name] = 0
        for feature_name in self.schema.categorical_feature_names:
            if feature_name not in populated.columns:
                populated[feature_name] = "unknown"
        if "url" in populated.columns:
            populated["url_length"] = populated["url"].fillna("").map(lambda value: len(str(value)))
            populated["hostname_length"] = populated["url"].fillna("").map(
                lambda value: len(self._safe_domain(str(value)) or "")
            )
        if "page_identity" in populated.columns:
            populated["page_identity"] = populated["page_identity"].fillna("unknown").astype(str)
            for category_name in [
                "login",
                "banking",
                "shopping",
                "cloud",
                "email",
                "social",
                "unknown",
                "checkout",
                "account",
                "payment",
            ]:
                populated[f"page_identity__{category_name}"] = (
                    populated["page_identity"] == category_name
                ).astype(int)
        return populated

    def validate_and_clean(self, frame: pd.DataFrame) -> dict:
        data = self._populate_feature_columns(frame.copy())
        data["sample_id"] = data.get("sample_id", range(len(data)))
        data["url"] = data.get("url", "")
        data["label"] = data.get("label", pd.NA)
        data["domain"] = data["url"].map(self._safe_domain)

        required_cols = {"sample_id", "url", "label"}
        missing = sorted(required_cols - set(data.columns))
        if missing:
            raise ValueError(f"Dataset is missing required columns: {missing}")

        cleaned_labels = data["label"].map(self._coerce_label)
        valid_mask = cleaned_labels.notna()
        invalid_rows = int((~valid_mask).sum())
        unknown_labels = int(cleaned_labels.isna().sum())
        valid_data = data.loc[valid_mask].copy()
        valid_data["label"] = cleaned_labels.loc[valid_mask].astype(int)
        valid_data["page_identity"] = valid_data.get("page_identity", "unknown").fillna("unknown").astype(str)

        result = {
            "data": valid_data.reset_index(drop=True),
            "valid_rows": pd.Series([len(valid_data)]),
            "invalid_rows": pd.Series([invalid_rows]),
            "unknown_labels": pd.Series([unknown_labels]),
            "quarantined": data.loc[~valid_mask].reset_index(drop=True),
        }
        return result
