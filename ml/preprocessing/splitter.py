from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass
class Splitter:
    random_seed: int = 42
    strategy: str = "domain_grouped"
    train_size: float = 0.7
    validation_size: float = 0.15
    test_size: float = 0.15

    def split(self, frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        data = frame.copy()
        if data.empty:
            return data.copy(), data.copy(), data.copy()

        if self.strategy == "domain_grouped":
            if "domain" not in data.columns:
                data["domain"] = data.get("url", "").map(
                    lambda url: url.split("//")[-1].split("/")[0].lower() if isinstance(url, str) and url else "unknown"
                )
            domains = sorted(data["domain"].dropna().astype(str).unique())
            if len(domains) < 2:
                train = data.copy()
                val = data.iloc[0:0].copy()
                test = data.iloc[0:0].copy()
                return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)

            train_domain = max(
                domains,
                key=lambda domain: (
                    len(data.loc[data["domain"].astype(str) == domain, "label"].unique()),
                    data.loc[data["domain"].astype(str) == domain, "label"].astype(int).sum(),
                    -sorted(domains).index(domain),
                ),
            )
            test_domains = [domain for domain in domains if domain != train_domain]
            train = data[data["domain"].astype(str) == train_domain].copy()
            test = data[data["domain"].astype(str).isin(test_domains)].copy()
            val = data.iloc[0:0].copy()
            return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)

        if self.strategy == "temporal":
            sort_key = data.get("collection_date", pd.Timestamp("2000-01-01"))
            if hasattr(sort_key, "dt"):
                data = data.sort_values(by="collection_date")
            else:
                data = data.sort_values(by=["collection_date"]) if "collection_date" in data.columns else data
            train_end = int(len(data) * self.train_size)
            val_end = int(len(data) * (self.train_size + self.validation_size))
            train = data.iloc[:train_end].copy()
            val = data.iloc[train_end:val_end].copy()
            test = data.iloc[val_end:].copy()
            return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)

        from sklearn.model_selection import train_test_split

        train, rest = train_test_split(
            data,
            train_size=self.train_size,
            random_state=self.random_seed,
            stratify=data["label"] if "label" in data.columns else None,
        )
        val, test = train_test_split(
            rest,
            test_size=(self.test_size / (self.validation_size + self.test_size)),
            random_state=self.random_seed,
            stratify=rest["label"] if "label" in rest.columns else None,
        )
        return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)
