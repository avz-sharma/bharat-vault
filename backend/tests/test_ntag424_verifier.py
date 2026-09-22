import pytest
from fastapi.testclient import TestClient

from backend.ntag424_verifier import (
    app,
    generate_mock_tap,
    verify_ntag_tap,
    register_chip,
    lookup_token,
    _chip_registry,
    _seen_taps,
    _MASTER_KEY_HEX,
    _API_KEY,
)


@pytest.fixture(autouse=True)
def clean_stores():
    """Clean in-memory stores before and after each test."""
    _chip_registry.clear()
    _seen_taps.clear()
    yield
    _chip_registry.clear()
    _seen_taps.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_mock_tap_and_verification_flow():
    test_uid = "04A23B1C5D6E7F"
    test_ctr = 100

    tap = generate_mock_tap(test_uid, _MASTER_KEY_HEX, counter=test_ctr)
    assert "enc_picc_data" in tap
    assert "cmac" in tap
    assert tap["counter"] == test_ctr

    result = verify_ntag_tap(tap["enc_picc_data"], tap["cmac"], _MASTER_KEY_HEX)
    assert result["valid"] is True
    assert result["uid"] == test_uid.lower()
    assert result["counter"] == test_ctr
    assert "successfully" in result["reason"]


def test_replay_attack_prevention():
    test_uid = "04A23B1C5D6E7F"
    tap = generate_mock_tap(test_uid, _MASTER_KEY_HEX, counter=200)

    # First verification must succeed
    first_res = verify_ntag_tap(tap["enc_picc_data"], tap["cmac"], _MASTER_KEY_HEX)
    assert first_res["valid"] is True

    # Immediate replay with identical counter must fail
    replay_res = verify_ntag_tap(tap["enc_picc_data"], tap["cmac"], _MASTER_KEY_HEX)
    assert replay_res["valid"] is False
    assert "Replay detected" in replay_res["reason"]


def test_counter_decremented_prevention():
    test_uid = "04A23B1C5D6E7F"
    register_chip(test_uid, token_id=42)

    tap_high = generate_mock_tap(test_uid, _MASTER_KEY_HEX, counter=500)
    res_high = verify_ntag_tap(tap_high["enc_picc_data"], tap_high["cmac"], _MASTER_KEY_HEX)
    assert res_high["valid"] is True

    # Attempt lower counter tap
    tap_low = generate_mock_tap(test_uid, _MASTER_KEY_HEX, counter=400)
    res_low = verify_ntag_tap(tap_low["enc_picc_data"], tap_low["cmac"], _MASTER_KEY_HEX)
    assert res_low["valid"] is False
    assert "Counter rollback" in res_low["reason"]


def test_invalid_cmac():
    test_uid = "04A23B1C5D6E7F"
    tap = generate_mock_tap(test_uid, _MASTER_KEY_HEX, counter=300)

    # Tamper with CMAC
    tampered_cmac = "0000000000000000"
    res = verify_ntag_tap(tap["enc_picc_data"], tampered_cmac, _MASTER_KEY_HEX)
    assert res["valid"] is False
    assert "CMAC mismatch" in res["reason"]


def test_chip_registration_and_lookup():
    uid = "04B1C2D3E4F5A6"
    assert lookup_token(uid) is None

    register_chip(uid, token_id=777)
    assert lookup_token(uid) == 777


def test_api_routes(client):
    headers = {"x-api-key": _API_KEY}
    uid = "04A1B2C3D4E5F6"

    # Register chip via endpoint
    reg_resp = client.post(
        "/api/v1/assets/register-chip",
        headers=headers,
        json={"uid_hex": uid, "token_id": 999},
    )
    assert reg_resp.status_code == 201
    assert reg_resp.json()["token_id"] == "999"

    # Generate mock tap via endpoint
    tap_resp = client.post(
        "/api/v1/assets/mock-tap",
        headers=headers,
        json={"uid_hex": uid, "counter": 50},
    )
    assert tap_resp.status_code == 200
    tap_data = tap_resp.json()

    # Verify physical tap via endpoint
    verify_resp = client.post(
        "/api/v1/assets/verify-physical",
        headers=headers,
        json={
            "enc_picc_data": tap_data["enc_picc_data"],
            "cmac": tap_data["cmac"],
        },
    )
    assert verify_resp.status_code == 200
    v_data = verify_resp.json()
    assert v_data["valid"] is True
    assert v_data["token_id"] == 999
    assert v_data["counter"] == 50


def test_api_unauthorized(client):
    resp = client.post(
        "/api/v1/assets/register-chip",
        headers={"x-api-key": "wrong-key"},
        json={"uid_hex": "04A1B2C3D4E5F6", "token_id": 1},
    )
    assert resp.status_code == 401
