from __future__ import annotations

import pandas as pd

RISK_STATES = ["KNOWN_MALWARE", "KNOWN_PHISHING", "HIGH_RISK", "SUSPICIOUS", "LOW_RISK", "UNKNOWN"]


def risk_state_report(frame: pd.DataFrame, state_column: str = "risk_state", truth_column: str = "label") -> dict:
    states = frame[state_column].where(frame[state_column].isin(RISK_STATES), "UNKNOWN") if state_column in frame else pd.Series(dtype=str)
    truth = frame[truth_column].astype(str).str.lower() if truth_column in frame else pd.Series(dtype=str)
    counts = {state: int((states == state).sum()) for state in RISK_STATES}
    by_truth = {}
    for label in sorted(truth.dropna().unique()):
        by_truth[str(label)] = {state: int(((truth == label) & (states == state)).sum()) for state in RISK_STATES}
    return {"state_counts": counts, "by_ground_truth": by_truth, "semantic_note": "LOW_RISK is not assumed benign and UNKNOWN is not assumed malicious."}
