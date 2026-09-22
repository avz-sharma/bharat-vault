"""
NTAG 424 DNA — Secure Unique NFC (SUN) Cryptogram Verification Service
=======================================================================

Implements the NXP NTAG 424 DNA authentication flow:
  1. The NFC chip stores a 128-bit AES key and maintains a 24-bit read counter.
  2. On every tap the chip encrypts PICCData (UID ‖ ReadCounter) with AES-128-CBC
     and computes an AES-128-CMAC over the encrypted PICCData.
  3. The backend decrypts PICCData, recomputes the CMAC, and compares.
  4. A successful verification links the chip's UID to an on-chain ERC-721 token.

References
----------
- NXP AN12196 — NTAG 424 DNA and NTAG 424 DNA TagTamper features and hints
- NIST SP 800-38B — Recommendation for Block Cipher Modes: CMAC
- RFC 4493 — The AES-CMAC Algorithm
"""

from __future__ import annotations

import hmac
import os
import struct
import time
from typing import Any

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.cmac import CMAC
from cryptography.hazmat.primitives.ciphers.algorithms import AES
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_PICC_DATA_LEN = 16          # 16 bytes: 7-byte UID + 3-byte counter + 6-byte padding
_UID_LEN = 7                 # NTAG 424 DNA 7-byte UID
_CTR_LEN = 3                 # 24-bit read counter
_IV = b"\x00" * 16           # AES-128-CBC IV per NXP SUN spec (zeros)
_CMAC_TRUNCATED_LEN = 8      # SUN message uses first 8 bytes of full 16-byte CMAC

# ---------------------------------------------------------------------------
# In-memory stores (replace with DB / Supabase in production)
# ---------------------------------------------------------------------------

# Maps chip UID (hex) -> { "token_id": int, "last_counter": int }
_chip_registry: dict[str, dict[str, Any]] = {}

# Replay protection: set of seen (uid_hex, counter) tuples
_seen_taps: set[tuple[str, int]] = set()

# ---------------------------------------------------------------------------
# Core Cryptographic Helpers
# ---------------------------------------------------------------------------


def _aes128_cbc_encrypt(key: bytes, plaintext: bytes) -> bytes:
    """AES-128-CBC encrypt with zero IV (NXP SUN convention)."""
    cipher = Cipher(algorithms.AES(key), modes.CBC(_IV))
    enc = cipher.encryptor()
    return enc.update(plaintext) + enc.finalize()


def _aes128_cbc_decrypt(key: bytes, ciphertext: bytes) -> bytes:
    """AES-128-CBC decrypt with zero IV."""
    cipher = Cipher(algorithms.AES(key), modes.CBC(_IV))
    dec = cipher.decryptor()
    return dec.update(ciphertext) + dec.finalize()


def _aes128_cmac(key: bytes, data: bytes) -> bytes:
    """Compute full 16-byte AES-128-CMAC (RFC 4493 / NIST SP 800-38B)."""
    c = CMAC(AES(key))
    c.update(data)
    return c.finalize()


def _derive_session_key(master_key: bytes, sv_prefix: bytes, counter: int) -> bytes:
    """
    Derive a session key for CMAC computation.

    Per NXP AN12196 §8.1 the SUN session key is:
        SessionKey = AES-128-ECB(MasterKey, SV)
    where SV = SV_PREFIX ‖ Counter (padded to 16 bytes).
    """
    sv = sv_prefix + struct.pack("<I", counter)          # 4-byte LE counter
    sv = sv.ljust(16, b"\x00")                           # pad to AES block
    cipher = Cipher(algorithms.AES(master_key), modes.ECB())
    enc = cipher.encryptor()
    return enc.update(sv) + enc.finalize()


# ---------------------------------------------------------------------------
# Public API — Mock Tap Generation
# ---------------------------------------------------------------------------


def generate_mock_tap(
    picc_data_hex: str,
    key_hex: str,
    *,
    counter: int | None = None,
) -> dict[str, str]:
    """
    Emulate an NTAG 424 DNA NFC tap.

    Parameters
    ----------
    picc_data_hex : str
        7-byte UID as a 14-char hex string (e.g. ``"04A23B1C5D6E7F"``).
    key_hex : str
        16-byte (32-char hex) AES-128 master key provisioned on the chip.
    counter : int, optional
        Explicit read counter value.  If *None* an auto-incrementing value is
        used based on the current epoch second (useful for testing).

    Returns
    -------
    dict
        ``{"enc_picc_data": "<hex>", "cmac": "<hex>", "counter": <int>}``
    """
    uid = bytes.fromhex(picc_data_hex)
    if len(uid) != _UID_LEN:
        raise ValueError(f"UID must be {_UID_LEN} bytes, got {len(uid)}")

    master_key = bytes.fromhex(key_hex)
    if len(master_key) != 16:
        raise ValueError("Master key must be 16 bytes (AES-128)")

    if counter is None:
        counter = int(time.time()) & 0x00FFFFFF          # 24-bit wrap

    # Build PICCData plaintext: UID (7) ‖ Counter (3 LE) ‖ padding (6)
    ctr_bytes = struct.pack("<I", counter)[:_CTR_LEN]    # little-endian 24-bit
    picc_plain = uid + ctr_bytes + b"\x00" * 6           # 16 bytes total

    # Encrypt PICCData
    enc_picc = _aes128_cbc_encrypt(master_key, picc_plain)

    # Derive session key and compute CMAC
    sv_prefix = b"\x3c\xc3\x00\x01"                     # NXP SV constant
    session_key = _derive_session_key(master_key, sv_prefix, counter)
    full_cmac = _aes128_cmac(session_key, enc_picc)
    truncated_cmac = full_cmac[:_CMAC_TRUNCATED_LEN]

    return {
        "enc_picc_data": enc_picc.hex(),
        "cmac": truncated_cmac.hex(),
        "counter": counter,
    }


# ---------------------------------------------------------------------------
# Public API — Tap Verification
# ---------------------------------------------------------------------------


def verify_ntag_tap(
    picc_data_hex: str,
    cmac_hex: str,
    master_key_hex: str,
) -> dict[str, Any]:
    """
    Verify an NTAG 424 DNA SUN cryptogram.

    Steps
    -----
    1. Decrypt ``picc_data_hex`` with AES-128-CBC (zero IV) to recover UID
       and ReadCounter.
    2. Derive a session key from the master key + counter.
    3. Recompute the AES-128 CMAC over the encrypted PICCData.
    4. Compare the first 8 bytes of the computed CMAC to ``cmac_hex``.
    5. Check replay protection (counter must be strictly increasing).

    Parameters
    ----------
    picc_data_hex : str
        Encrypted PICCData from the chip (32-char hex, 16 bytes).
    cmac_hex : str
        Truncated CMAC from the chip (16-char hex, 8 bytes).
    master_key_hex : str
        Master AES-128 key (32-char hex, 16 bytes).

    Returns
    -------
    dict
        ``{"valid": bool, "uid": str | None, "counter": int | None,
           "reason": str}``
    """
    try:
        enc_picc = bytes.fromhex(picc_data_hex)
        received_cmac = bytes.fromhex(cmac_hex)
        master_key = bytes.fromhex(master_key_hex)
    except ValueError as exc:
        return {"valid": False, "uid": None, "counter": None,
                "reason": f"Hex decode error: {exc}"}

    if len(enc_picc) != 16:
        return {"valid": False, "uid": None, "counter": None,
                "reason": "Encrypted PICCData must be 16 bytes"}
    if len(received_cmac) != _CMAC_TRUNCATED_LEN:
        return {"valid": False, "uid": None, "counter": None,
                "reason": "CMAC must be 8 bytes (truncated)"}
    if len(master_key) != 16:
        return {"valid": False, "uid": None, "counter": None,
                "reason": "Master key must be 16 bytes"}

    # --- Step 1: Decrypt PICCData ---
    picc_plain = _aes128_cbc_decrypt(master_key, enc_picc)
    uid = picc_plain[:_UID_LEN]
    ctr_bytes = picc_plain[_UID_LEN : _UID_LEN + _CTR_LEN]
    counter = int.from_bytes(ctr_bytes, "little")
    uid_hex = uid.hex()

    # --- Step 2: Derive session key ---
    sv_prefix = b"\x3c\xc3\x00\x01"
    session_key = _derive_session_key(master_key, sv_prefix, counter)

    # --- Step 3: Recompute CMAC ---
    expected_cmac = _aes128_cmac(session_key, enc_picc)[:_CMAC_TRUNCATED_LEN]

    # --- Step 4: Constant-time compare ---
    if not hmac.compare_digest(expected_cmac, received_cmac):
        return {"valid": False, "uid": uid_hex, "counter": counter,
                "reason": "CMAC mismatch — possible cloning or key error"}

    # --- Step 5: Replay protection ---
    tap_id = (uid_hex, counter)
    if tap_id in _seen_taps:
        return {"valid": False, "uid": uid_hex, "counter": counter,
                "reason": "Replay detected — counter already seen"}

    last = _chip_registry.get(uid_hex, {}).get("last_counter", -1)
    if counter <= last:
        return {"valid": False, "uid": uid_hex, "counter": counter,
                "reason": f"Counter rollback: got {counter}, "
                          f"expected > {last}"}

    _seen_taps.add(tap_id)
    if uid_hex in _chip_registry:
        _chip_registry[uid_hex]["last_counter"] = counter

    return {"valid": True, "uid": uid_hex, "counter": counter,
            "reason": "Cryptogram verified successfully"}


# ---------------------------------------------------------------------------
# Chip ↔ Token Registration (in-memory demo)
# ---------------------------------------------------------------------------


def register_chip(uid_hex: str, token_id: int) -> None:
    """Bind an NFC chip UID to an ERC-721 token ID."""
    _chip_registry[uid_hex.lower()] = {
        "token_id": token_id,
        "last_counter": -1,
    }


def lookup_token(uid_hex: str) -> int | None:
    """Return the ERC-721 token ID bound to this chip, or None."""
    entry = _chip_registry.get(uid_hex.lower())
    return entry["token_id"] if entry else None


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="NTAG 424 DNA Physical-Asset Verifier",
    version="1.0.0",
    description="Binds NXP NTAG 424 DNA NFC chips to on-chain ERC-721 tokens "
                "via AES-128 SUN cryptogram verification.",
)


# --- Request / Response Models ----

class VerifyTapRequest(BaseModel):
    """Payload sent by the mobile app after an NFC tap."""
    enc_picc_data: str = Field(
        ..., min_length=32, max_length=32,
        description="Encrypted PICCData (16 bytes, hex-encoded)",
        examples=["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"],
    )
    cmac: str = Field(
        ..., min_length=16, max_length=16,
        description="Truncated 8-byte CMAC (hex-encoded)",
        examples=["1a2b3c4d5e6f7a8b"],
    )


class VerifyTapResponse(BaseModel):
    valid: bool
    uid: str | None = None
    counter: int | None = None
    token_id: int | None = None
    reason: str


class RegisterChipRequest(BaseModel):
    uid_hex: str = Field(
        ..., min_length=14, max_length=14,
        description="7-byte chip UID (hex-encoded)",
    )
    token_id: int = Field(..., ge=0, description="ERC-721 token ID")


class MockTapRequest(BaseModel):
    """Generate a mock NFC tap for testing."""
    uid_hex: str = Field(
        ..., min_length=14, max_length=14,
        description="7-byte chip UID (hex-encoded)",
    )
    counter: int | None = Field(
        None, ge=0, le=0xFFFFFF,
        description="Optional explicit 24-bit counter",
    )


class MockTapResponse(BaseModel):
    enc_picc_data: str
    cmac: str
    counter: int


# --- Security: API key gate (swap for JWT / OAuth2 in prod) ---

_API_KEY = os.environ.get("NTAG_API_KEY", "dev-insecure-key")


async def _require_api_key(x_api_key: str = Header(...)) -> str:
    if not hmac.compare_digest(x_api_key, _API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


# --- Master key (would come from HSM / Vault in production) ---

_MASTER_KEY_HEX = os.environ.get(
    "NTAG_MASTER_KEY",
    "00112233445566778899aabbccddeeff",          # ⚠️  demo-only default
)


# --- Routes ---

@app.post(
    "/api/v1/assets/verify-physical",
    response_model=VerifyTapResponse,
    summary="Verify an NFC tap and resolve the bound ERC-721 token",
    tags=["Physical Assets"],
)
async def verify_physical_asset(
    body: VerifyTapRequest,
    _key: str = Depends(_require_api_key),
) -> VerifyTapResponse:
    """
    Accepts encrypted PICCData + CMAC from a mobile NFC reader, verifies the
    NTAG 424 DNA SUN cryptogram, and returns the linked ERC-721 ``token_id``
    if the chip is registered.
    """
    result = verify_ntag_tap(
        picc_data_hex=body.enc_picc_data,
        cmac_hex=body.cmac,
        master_key_hex=_MASTER_KEY_HEX,
    )

    token_id = None
    if result["valid"] and result["uid"]:
        token_id = lookup_token(result["uid"])
        if token_id is None:
            result["reason"] += " — chip not bound to any ERC-721 token"

    return VerifyTapResponse(
        valid=result["valid"],
        uid=result["uid"],
        counter=result["counter"],
        token_id=token_id,
        reason=result["reason"],
    )


@app.post(
    "/api/v1/assets/register-chip",
    status_code=201,
    summary="Bind an NFC chip UID to an ERC-721 token ID",
    tags=["Physical Assets"],
)
async def register_chip_route(
    body: RegisterChipRequest,
    _key: str = Depends(_require_api_key),
) -> dict[str, str]:
    register_chip(body.uid_hex, body.token_id)
    return {"status": "registered", "uid": body.uid_hex,
            "token_id": str(body.token_id)}


@app.post(
    "/api/v1/assets/mock-tap",
    response_model=MockTapResponse,
    summary="Generate a mock NFC tap for testing",
    tags=["Testing"],
)
async def mock_tap_route(
    body: MockTapRequest,
    _key: str = Depends(_require_api_key),
) -> MockTapResponse:
    tap = generate_mock_tap(
        picc_data_hex=body.uid_hex,
        key_hex=_MASTER_KEY_HEX,
        counter=body.counter,
    )
    return MockTapResponse(**tap)


# ---------------------------------------------------------------------------
# Self-test (run directly: python ntag424_verifier.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("NTAG 424 DNA SUN Cryptogram — Self-Test")
    print("=" * 60)

    TEST_UID = "04A23B1C5D6E7F"
    TEST_KEY = "00112233445566778899aabbccddeeff"
    TEST_CTR = 42

    # Register chip
    register_chip(TEST_UID, token_id=1001)

    # Generate mock tap
    tap = generate_mock_tap(TEST_UID, TEST_KEY, counter=TEST_CTR)
    print(f"\n[TAP]  enc_picc_data = {tap['enc_picc_data']}")
    print(f"[TAP]  cmac          = {tap['cmac']}")
    print(f"[TAP]  counter       = {tap['counter']}")

    # Verify
    result = verify_ntag_tap(tap["enc_picc_data"], tap["cmac"], TEST_KEY)
    print(f"\n[VERIFY] valid   = {result['valid']}")
    print(f"[VERIFY] uid     = {result['uid']}")
    print(f"[VERIFY] counter = {result['counter']}")
    print(f"[VERIFY] reason  = {result['reason']}")

    assert result["valid"], "Self-test FAILED: valid tap rejected"
    assert result["uid"] == TEST_UID.lower(), "UID mismatch"
    assert result["counter"] == TEST_CTR, "Counter mismatch"

    # Replay must fail
    replay = verify_ntag_tap(tap["enc_picc_data"], tap["cmac"], TEST_KEY)
    assert not replay["valid"], "Self-test FAILED: replay not detected"
    print(f"\n[REPLAY] valid  = {replay['valid']}  (expected False)")
    print(f"[REPLAY] reason = {replay['reason']}")

    # Token lookup
    token = lookup_token(TEST_UID)
    assert token == 1001, "Token lookup failed"
    print(f"\n[TOKEN] chip {TEST_UID} -> ERC-721 #{token}")

    print("\n[OK] All self-tests passed.")
