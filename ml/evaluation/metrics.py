from __future__ import annotations

import numpy as np
from sklearn.metrics import accuracy_score, average_precision_score, confusion_matrix, f1_score, log_loss, precision_score, recall_score, roc_auc_score


def compute_binary_metrics(y_true, y_score, threshold: float = 0.5) -> dict:
    y_pred = (np.asarray(y_score) >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1": f1_score(y_true, y_pred, zero_division=0),
        "accuracy": accuracy_score(y_true, y_pred),
        "roc_auc": roc_auc_score(y_true, y_score) if len(np.unique(y_true)) == 2 else None,
        "pr_auc": average_precision_score(y_true, y_score) if len(np.unique(y_true)) == 2 else None,
        "log_loss": log_loss(y_true, np.clip(np.asarray(y_score), 1e-7, 1 - 1e-7), labels=[0, 1]),
        "false_positive_rate": fp / (fp + tn) if (fp + tn) else 0.0,
        "false_negative_rate": fn / (fn + tp) if (fn + tp) else 0.0,
        "confusion_matrix": [[tn, fp], [fn, tp]],
        "true_positives": int(tp),
        "true_negatives": int(tn),
        "false_positives": int(fp),
        "false_negatives": int(fn),
    }
