import pandas as pd

from ml.evaluation.dataset_quality import dataset_quality_report, validate_evaluation_dataset
from ml.evaluation.hard_negatives import identify_hard_negatives
from ml.evaluation.metrics import compute_binary_metrics
from ml.evaluation.risk_states import risk_state_report
from ml.evaluation.splits import validate_split_leakage


def test_dataset_validation_preserves_unknown_and_detects_quality_issues():
    frame = pd.DataFrame({
        "sample_id": ["a", "b", "c", "d"],
        "url": ["https://a.test", "https://a.test", "not-a-url", None],
        "label": ["benign", "phishing", "unknown", "malware"],
        "domain": ["a.test", "a.test", "a.test", "d.test"],
        "collection_date": ["2025-01-01", "bad-date", "2025-01-03", "2025-01-04"],
    })
    report = dataset_quality_report(frame)
    assert report["duplicate_url_rows"] == 2
    assert report["malformed_url_count"] == 2
    assert report["conflicting_label_groups"] == 1
    assert report["label_counts"]["unknown"] == 1
    assert validate_evaluation_dataset(frame)["valid"] is False


def test_metrics_include_false_positive_and_negative_analysis():
    metrics = compute_binary_metrics([0, 0, 1, 1], [0.1, 0.8, 0.2, 0.9])
    assert metrics["accuracy"] == 0.5
    assert "false_positive_rate" in metrics
    assert "false_negative_rate" in metrics
    assert metrics["true_positives"] == 1
    assert metrics["false_positives"] == 1


def test_split_leakage_detects_domain_and_temporal_overlap():
    train = pd.DataFrame({"sample_id": ["a"], "domain": ["same.test"], "collection_date": ["2024-01-01"]})
    test = pd.DataFrame({"sample_id": ["b"], "domain": ["same.test"], "collection_date": ["2023-01-01"]})
    report = validate_split_leakage(train, pd.DataFrame(), test, "domain_grouped")
    assert report["valid"] is False
    assert "train_test_domain" in report["overlaps"]

    temporal = validate_split_leakage(train, pd.DataFrame(), test, "temporal")
    assert temporal["valid"] is False
    assert temporal["temporal_violations"]


def test_hard_negative_detection_is_diagnostic_only():
    hard = identify_hard_negatives(pd.DataFrame({
        "sample_id": ["a", "b"],
        "url": ["https://example.test/" + "x" * 120, "https://ordinary.test"],
        "domain": ["a.b.c.test", "ordinary.test"],
        "page_identity": ["login password", "unknown"],
    }))
    assert set(hard["sample_id"]) == {"a"}
    assert "hard_negative_login" in hard.columns


def test_risk_state_report_does_not_assign_ground_truth_semantics():
    report = risk_state_report(pd.DataFrame({
        "label": ["benign", "phishing", "unknown"],
        "risk_state": ["LOW_RISK", "UNKNOWN", "UNKNOWN"],
    }))
    assert report["state_counts"]["UNKNOWN"] == 2
    assert "not assumed benign" in report["semantic_note"]
