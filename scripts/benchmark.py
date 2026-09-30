"""Local microbenchmarks; does not include wallet prompts or chain finality."""

import json
import platform
import statistics
import time
from pathlib import Path

import httpx

from backend.nfc import verify_tap


def measure(operation, count):
    values = []
    for _ in range(count):
        start = time.perf_counter()
        operation()
        values.append((time.perf_counter() - start) * 1000)
    ordered = sorted(values)
    return {
        "samples": count,
        "concurrency": 1,
        "p50_ms": statistics.median(values),
        "p95_ms": ordered[int((count - 1) * 0.95)],
    }


output = {
    "os": platform.platform(),
    "processor": platform.processor(),
    "python": platform.python_version(),
    "dataset": "six synthetic assets, local chain, SQLite WAL",
    "nfc_crypto_only": measure(
        lambda: verify_tap(
            "EF963FF7828658A599F3041510671E88", "94EED9EE65337086", bytes(16), bytes(16)
        ),
        200,
    ),
}
with httpx.Client(base_url="http://127.0.0.1:8000", timeout=10) as client:
    output["inventory_http_including_loopback_rpc"] = measure(
        lambda: client.get(
            "/api/v1/assets",
            params={"identity": "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"},
        ).raise_for_status(),
        50,
    )
Path("validation").mkdir(exist_ok=True)
Path("validation/benchmark.json").write_text(json.dumps(output, indent=2))
print(json.dumps(output, indent=2))
