from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlsplit

import pandas as pd


@dataclass
class DuplicatePolicy:
    exact_url: str = "remove"
    exact_feature_vector: str = "remove"
    same_domain: str = "group"


class Deduplicator:
    def __init__(self, policy: DuplicatePolicy | None = None):
        self.policy = policy or DuplicatePolicy()

    @staticmethod
    def _normalize_url(value: str | None) -> str | None:
        if value is None or not str(value).strip():
            return None
        parsed = urlsplit(str(value))
        normalized = parsed.netloc.lower() + parsed.path.rstrip("/") + ("?" + parsed.query if parsed.query else "")
        return normalized or str(value).strip().lower()

    def deduplicate(self, frame: pd.DataFrame) -> pd.DataFrame:
        data = frame.copy()
        if not data.empty and "url" in data.columns:
            data["normalized_url"] = data["url"].map(self._normalize_url)
            if self.policy.exact_url == "remove":
                data = data.drop_duplicates(subset=["normalized_url"], keep="first")
        if self.policy.exact_feature_vector == "remove" and not data.empty:
            feature_columns = [
                column for column in data.columns if column not in {"sample_id", "url", "label", "domain", "normalized_url"}
            ]
            if feature_columns:
                data = data.drop_duplicates(subset=feature_columns, keep="first")
        if self.policy.same_domain == "group" and "domain" in data.columns:
            data["duplicate_group"] = data["domain"].fillna("unknown")
        return data.reset_index(drop=True)
