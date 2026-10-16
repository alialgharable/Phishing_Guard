from __future__ import annotations

import pandas as pd


def validate_split_leakage(train: pd.DataFrame, validation: pd.DataFrame, test: pd.DataFrame, strategy: str) -> dict:
    partitions = {"train": train, "validation": validation, "test": test}
    overlaps: dict[str, list[str]] = {}
    partition_names = list(partitions)
    for left_index, left_name in enumerate(partition_names):
        left = partitions[left_name]
        for right_name in partition_names[left_index + 1:]:
            right = partitions[right_name]
            for key in ["sample_id", "normalized_url"]:
                if key in left.columns and key in right.columns:
                    shared = set(left[key].dropna()) & set(right[key].dropna())
                    if shared:
                        overlaps[f"{left_name}_{right_name}_{key}"] = sorted(map(str, shared))
            if strategy == "domain_grouped" and "domain" in left.columns and "domain" in right.columns:
                shared_domains = set(left["domain"].dropna().astype(str)) & set(right["domain"].dropna().astype(str))
                if shared_domains:
                    overlaps[f"{left_name}_{right_name}_domain"] = sorted(shared_domains)
    temporal_violations = []
    if strategy == "temporal" and "collection_date" in train.columns and "collection_date" in test.columns:
        train_dates = pd.to_datetime(train["collection_date"], errors="coerce", utc=True).dropna()
        test_dates = pd.to_datetime(test["collection_date"], errors="coerce", utc=True).dropna()
        if not train_dates.empty and not test_dates.empty and train_dates.max() > test_dates.min():
            temporal_violations.append("training data is newer than held-out test data")
    return {"valid": not overlaps and not temporal_violations, "overlaps": overlaps, "temporal_violations": temporal_violations, "strategy": strategy}
