import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("gate", Path("scripts/check-slither.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


@pytest.mark.parametrize(
    "payload",
    [
        None,
        "bad-json",
        {},
        {"success": False},
        {"success": True, "results": {}},
        {
            "success": True,
            "results": {"detectors": [{"impact": "High", "check": "reentrancy"}]},
        },
    ],
)
def test_analyzer_fails_closed(tmp_path, payload):
    report = tmp_path / "slither.json"
    if payload is not None:
        report.write_text(payload if isinstance(payload, str) else json.dumps(payload))
    with pytest.raises((ValueError, OSError)):
        gate.validate(report)


def test_successful_empty_analysis(tmp_path):
    report = tmp_path / "slither.json"
    report.write_text(json.dumps({"success": True, "results": {"detectors": []}}))
    assert gate.validate(report) == 0
