from __future__ import annotations

from urllib.parse import urlsplit

import pandas as pd

_ALLOWED_LABELS = {"benign", "phishing", "malware", "unknown", "unverified"}


def _valid_url(value: object) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        parsed = urlsplit(value)
        return parsed.scheme in {"http", "https"} and bool(parsed.hostname)
    except ValueError:
        return False


def normalize_evaluation_label(value: object) -> str:
    if value is None or pd.isna(value):
        return "unknown"
    normalized = str(value).strip().lower()
    if normalized in {"0", "benign", "clean", "legitimate"}:
        return "benign"
    if normalized in {"1", "phishing", "phish"}:
        return "phishing"
    if normalized in {"malware", "malicious"}:
        return "malware"
    if normalized in {"unknown", "unverified", "uncertain"}:
        return "unknown"
    return "unknown"


def dataset_quality_report(frame: pd.DataFrame) -> dict:
    data = frame.copy()
    labels = data.get("label", pd.Series([None] * len(data))).map(normalize_evaluation_label)
    url_series = data.get("url", pd.Series([None] * len(data)))
    domains = data.get("domain", pd.Series([None] * len(data))).astype("string")
    duplicate_urls = int(url_series.dropna().astype(str).str.lower().duplicated(keep=False).sum())
    conflicts = 0
    if "url" in data.columns:
        conflicts = int(data.assign(_label=labels).groupby(data["url"].astype(str))["_label"].nunique().gt(1).sum())
    invalid_dates = 0
    if "collection_date" in data.columns:
        invalid_dates = int(pd.to_datetime(data["collection_date"], errors="coerce", utc=True).isna().sum())
    return {
        "row_count": int(len(data)),
        "required_columns": {name: name in data.columns for name in ["sample_id", "url", "label", "domain", "page_identity", "collection_date", "source"]},
        "missing_url_count": int(url_series.isna().sum() + (url_series.astype("string").str.strip() == "").sum()),
        "malformed_url_count": int((~url_series.map(_valid_url)).sum()),
        "duplicate_url_rows": duplicate_urls,
        "duplicate_feature_vector_rows": int(data.duplicated().sum()),
        "duplicate_domain_rows": int(domains.duplicated(keep=False).sum()),
        "conflicting_label_groups": conflicts,
        "missing_label_count": int(labels.eq("unknown").sum()),
        "invalid_date_count": invalid_dates,
        "label_counts": {label: int((labels == label).sum()) for label in sorted(_ALLOWED_LABELS - {"unverified"})},
        "unknown_labels_preserved": True,
    }


def validate_evaluation_dataset(frame: pd.DataFrame) -> dict:
    report = dataset_quality_report(frame)
    errors = []
    if report["row_count"] == 0:
        errors.append("dataset is empty")
    if report["missing_url_count"]:
        errors.append("missing URLs present")
    if report["conflicting_label_groups"]:
        errors.append("conflicting labels present")
    return {"valid": not errors, "errors": errors, "report": report}
