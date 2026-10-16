from __future__ import annotations

import json
from pathlib import Path

import joblib


class ModelArtifactWriter:
    def __init__(self, artifact_dir: str | Path):
        self.artifact_dir = Path(artifact_dir)
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

    def save(self, model_name: str, model, metadata: dict) -> Path:
        target_dir = self.artifact_dir / model_name
        target_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, target_dir / "model.joblib")
        with (target_dir / "metadata.json").open("w", encoding="utf-8") as handle:
            json.dump(metadata, handle, indent=2, sort_keys=True)
        return target_dir

    def save_calibration_artifact(self, name: str, artifact, metadata: dict) -> Path:
        target_dir = self.artifact_dir / name
        target_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(artifact, target_dir / "calibration.joblib")
        with (target_dir / "metadata.json").open("w", encoding="utf-8") as handle:
            json.dump(metadata, handle, indent=2, sort_keys=True)
        return target_dir

    @staticmethod
    def load(model_dir: str | Path):
        path = Path(model_dir)
        model = joblib.load(path / "model.joblib")
        with (path / "metadata.json").open("r", encoding="utf-8") as handle:
            metadata = json.load(handle)
        return {"model": model, "metadata": metadata}
