from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

import pandas as pd


_CATEGORY_VALUES = {
    "page_identity": [
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
    ]
}


class FeatureSchema:
    def __init__(self, schema_path: str | Path | None = None):
        self.schema_path = Path(schema_path) if schema_path else self._default_schema_path()
        self.registry = self._load_registry(self.schema_path)
        self.version = self.registry["version"]
        self.feature_definitions = self.registry["features"]
        self.feature_names = [feature["name"] for feature in self.feature_definitions]
        self.feature_count = len(self.feature_names)
        self.numeric_feature_names = [
            feature["name"] for feature in self.feature_definitions if feature["type"] != "categorical"
        ]
        self.categorical_feature_names = [
            feature["name"] for feature in self.feature_definitions if feature["type"] == "categorical"
        ]
        self.one_hot_feature_names = self._build_one_hot_names()

    @staticmethod
    def _default_schema_path() -> Path:
        return Path(__file__).resolve().parent / "feature_registry.json"

    @staticmethod
    def _load_registry(schema_path: str | Path) -> dict:
        path = Path(schema_path)
        if not path.exists():
            raise FileNotFoundError(
                f"Feature schema file is missing: {path}. Run the TypeScript export before training."
            )
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            raise ValueError("Feature schema JSON must contain an object payload.")
        if "version" not in payload or "features" not in payload:
            raise ValueError("Feature schema JSON is missing version or features metadata.")
        return payload

    def _build_one_hot_names(self) -> list[str]:
        names: list[str] = []
        for category_name in self.categorical_feature_names:
            values = _CATEGORY_VALUES.get(category_name, ["unknown"])
            names.extend(f"{category_name}__{value}" for value in values)
        return names

    def validate_frame(self, frame: pd.DataFrame) -> None:
        if frame.empty:
            raise ValueError("Dataset is empty.")
        missing_columns = [
            feature for feature in self.numeric_feature_names if feature not in frame.columns
        ]
        if missing_columns:
            for missing in missing_columns[:5]:
                frame[missing] = 0
        if "page_identity" in self.categorical_feature_names and "page_identity" not in frame.columns:
            frame["page_identity"] = "unknown"

    def expected_feature_count(self) -> int:
        return len(self.numeric_feature_names)

    def compatible(self, frame: pd.DataFrame) -> bool:
        numeric_missing = [name for name in self.numeric_feature_names if name not in frame.columns]
        return len(numeric_missing) == 0

    def require_compatibility(self, frame: pd.DataFrame) -> None:
        if not self.compatible(frame):
            raise ValueError("Feature schema is incompatible with the dataset columns.")


def load_feature_schema(schema_path: str | Path | None = None) -> FeatureSchema:
    return FeatureSchema(schema_path=schema_path)
