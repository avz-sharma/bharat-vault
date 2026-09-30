"""Fail closed on missing, invalid, failed or high/medium-severity analysis."""

import json
import sys
from pathlib import Path


def validate(path):
    data = json.loads(Path(path).read_text())
    if data.get("success") is not True or data.get("error"):
        raise ValueError("Slither did not complete successfully")
    results = data.get("results")
    if not isinstance(results, dict) or not isinstance(results.get("detectors"), list):
        raise ValueError("Invalid analyzer report")
    findings = results["detectors"]
    if any(not isinstance(item, dict) or "impact" not in item for item in findings):
        raise ValueError("Invalid finding")
    blocked = [item for item in findings if item["impact"] in ("High", "Medium")]
    if blocked:
        raise ValueError(
            "Blocking Slither findings: " + ", ".join(item["check"] for item in blocked)
        )
    return len(findings)


if __name__ == "__main__":
    try:
        print(f"Analyzer completed: {validate(sys.argv[1])} non-blocking findings")
    except (OSError, ValueError, KeyError, IndexError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
