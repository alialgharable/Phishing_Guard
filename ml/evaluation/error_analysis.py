from __future__ import annotations

import pandas as pd

CATEGORIES = ["URL", "THREAT_INTELLIGENCE", "DOMAIN", "REDIRECT", "CONTENT", "BRAND", "ML"]


def _category_counts(values) -> dict[str, int]:
    counts = {category: 0 for category in CATEGORIES}
    for value in values or []:
        category = value.get("category") if isinstance(value, dict) else value
        if category in counts:
            counts[category] += 1
    return counts


def error_analysis(frame: pd.DataFrame, predicted_column: str = "predicted_state", truth_column: str = "label") -> dict:
    false_positive = frame[frame[predicted_column].isin(["HIGH_RISK", "SUSPICIOUS", "KNOWN_PHISHING", "KNOWN_MALWARE"]) & frame[truth_column].astype(str).str.lower().eq("benign")] if predicted_column in frame and truth_column in frame else frame.iloc[0:0]
    false_negative = frame[frame[predicted_column].isin(["LOW_RISK", "UNKNOWN", "SUSPICIOUS"]) & frame[truth_column].astype(str).str.lower().isin(["phishing", "malware"])] if predicted_column in frame and truth_column in frame else frame.iloc[0:0]
    return {
        "false_positive_count": int(len(false_positive)),
        "false_negative_count": int(len(false_negative)),
        "false_positive_categories": _category_counts(false_positive.get("evidence_categories", []).tolist() if "evidence_categories" in false_positive else []),
        "false_negative_categories": _category_counts(false_negative.get("evidence_categories", []).tolist() if "evidence_categories" in false_negative else []),
        "note": "Diagnostic analysis only; it does not alter fusion policy or optimize weights.",
    }
