import pandas as pd
import pytest

from ml.features.schema import FeatureSchema, load_feature_schema
from ml.preprocessing.dataset_cleaner import DatasetCleaner
from ml.preprocessing.deduplicator import DuplicatePolicy, Deduplicator
from ml.preprocessing.splitter import Splitter


@pytest.fixture
def feature_schema() -> FeatureSchema:
    return load_feature_schema()


def test_feature_schema_loads_and_matches_registry(feature_schema):
    assert feature_schema.version == "1.0.0"
    assert feature_schema.feature_count > 100
    assert "url_length" in feature_schema.numeric_feature_names
    assert "page_identity" in feature_schema.categorical_feature_names
    assert "page_identity__login" in feature_schema.one_hot_feature_names


def test_dataset_cleaner_rejects_invalid_labels(feature_schema):
    df = pd.DataFrame(
        {
            "sample_id": ["s1", "s2", "s3"],
            "url": ["https://a.example", "https://b.example", "https://c.example"],
            "label": [0, 1, "unknown"],
            "page_identity": ["login", "banking", "shopping"],
        }
    )

    cleaned = DatasetCleaner(schema=feature_schema).validate_and_clean(df)
    assert cleaned["valid_rows"].item() == 2
    assert cleaned["invalid_rows"].item() == 1
    assert cleaned["unknown_labels"].item() == 1


def test_deduplicator_removes_exact_url_and_feature_duplicates():
    df = pd.DataFrame(
        {
            "sample_id": ["a", "b", "c"],
            "url": ["https://example.com", "https://example.com/", "https://other.example"],
            "label": [0, 0, 1],
            "page_identity": ["login", "login", "banking"],
        }
    )
    policy = DuplicatePolicy(exact_url="remove", exact_feature_vector="remove", same_domain="group")
    result = Deduplicator(policy=policy).deduplicate(df)
    assert len(result) == 2
    assert result["url"].nunique() == 2


def test_splitter_domain_grouped_separates_domains():
    df = pd.DataFrame(
        {
            "sample_id": ["s1", "s2", "s3", "s4"],
            "url": [
                "https://a.example/login",
                "https://a.example/account",
                "https://b.example/verify",
                "https://b.example/info",
            ],
            "label": [0, 1, 0, 1],
            "page_identity": ["login", "login", "banking", "banking"],
            "domain": ["a.example", "a.example", "b.example", "b.example"],
        }
    )

    train, val, test = Splitter(random_seed=42, strategy="domain_grouped").split(df)
    assert set(train["domain"]) == {"a.example"}
    assert set(test["domain"]) == {"b.example"}
    assert set(val["domain"]).issubset({"a.example", "b.example"}) or len(val) == 0


def test_baseline_models_train_and_predict_on_tiny_synthetic_data(feature_schema):
    df = pd.DataFrame(
        {
            "sample_id": ["n1", "n2", "n3", "p1", "p2", "p3"],
            "url": [
                "https://normal.example",
                "https://normal.example/login",
                "https://normal.example/secure",
                "https://evil.example/login",
                "https://evil.example/verify",
                "https://evil.example/update",
            ],
            "label": [0, 0, 1, 1, 1, 1],
            "page_identity": ["login", "login", "banking", "login", "login", "banking"],
            "domain": ["normal.example", "normal.example", "normal.example", "evil.example", "evil.example", "evil.example"],
        }
    )

    cleaned = DatasetCleaner(schema=feature_schema).validate_and_clean(df)
    train, _, _ = Splitter(random_seed=42, strategy="domain_grouped").split(cleaned["data"])

    X_train = train[["url_length", "hostname_length", "page_identity__login"]].fillna(0)
    y_train = train["label"]

    from sklearn.linear_model import LogisticRegression
    model = LogisticRegression(max_iter=200, random_state=42)
    model.fit(X_train, y_train)
    pred = model.predict(X_train)

    assert len(pred) == len(y_train)
    assert set(pred.tolist()).issubset({0, 1})
