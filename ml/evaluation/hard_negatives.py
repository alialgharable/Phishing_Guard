from __future__ import annotations

import pandas as pd

HARD_NEGATIVE_TOKENS = {
    "login": ["login", "signin", "sign-in"],
    "password_fields": ["password", "credential"],
    "long_url": [],
    "many_subdomains": [],
    "redirects": [],
    "javascript_heavy": [],
    "external_resources": [],
    "brand_related": [],
}


def identify_hard_negatives(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.copy()
    text = data.astype(str).apply(lambda column: column.str.lower())
    masks = {
        "login": text.apply(lambda row: row.str.contains("login|signin|sign-in", regex=True).any(), axis=1),
        "password_fields": text.apply(lambda row: row.str.contains("password|credential", regex=True).any(), axis=1),
        "long_url": text["url"].str.len().gt(100) if "url" in text else pd.Series(False, index=data.index),
        "many_subdomains": text["domain"].str.count(r"\.").ge(3) if "domain" in text else pd.Series(False, index=data.index),
        "redirects": text.apply(lambda row: row.str.contains("redirect", regex=False).any(), axis=1),
        "javascript_heavy": text.apply(lambda row: row.str.contains("javascript|script", regex=True).any(), axis=1),
        "external_resources": text.apply(lambda row: row.str.contains("external|cdn|cloud", regex=True).any(), axis=1),
        "brand_related": text.apply(lambda row: row.str.contains("brand|official", regex=True).any(), axis=1),
    }
    for name, mask in masks.items():
        data[f"hard_negative_{name}"] = mask
    flag_columns = []
    for name, mask in masks.items():
        column = f"hard_negative_{name}"
        data[column] = mask
        flag_columns.append(column)
    data["hard_negative"] = data[flag_columns].any(axis=1)
    return data[data["hard_negative"]].copy()
