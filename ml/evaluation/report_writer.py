from __future__ import annotations

import json
from pathlib import Path


def write_evaluation_reports(report_dir: str | Path, reports: dict[str, object]) -> list[Path]:
    directory = Path(report_dir)
    directory.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, payload in reports.items():
        path = directory / f"{name}.json"
        path.write_text(json.dumps(payload, indent=2, sort_keys=True, default=str), encoding="utf-8")
        paths.append(path)
    return paths
