"""AN12196 rev 2.0 encrypted PICC profile; no hardware validation claim.

Supports C7 header, 7-byte UID, mirrored 24-bit counter, separate AES keys.
mac_input must come from the provisioned NDEF configuration, never a guessed URL.
Verification has no registration, replay or authorization side effects.
"""

from dataclasses import dataclass
from hmac import compare_digest

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.cmac import CMAC


@dataclass(frozen=True)
class Tap:
    uid: str
    counter: int


def cmac(key: bytes, data: bytes) -> bytes:
    if len(key) != 16:
        raise ValueError("AES-128 key required")
    value = CMAC(algorithms.AES(key))
    value.update(data)
    return value.finalize()


def verify_tap(
    encrypted: str,
    mac: str,
    meta_key: bytes,
    file_key: bytes,
    *,
    mac_input: bytes = b"",
) -> Tap:
    cipher, received = bytes.fromhex(encrypted), bytes.fromhex(mac)
    if len(cipher) != 16 or len(received) != 8 or len(meta_key) != 16:
        raise ValueError("Invalid encrypted PICC data, MAC or key length")
    decrypt = Cipher(algorithms.AES(meta_key), modes.CBC(bytes(16))).decryptor()
    plain = decrypt.update(cipher) + decrypt.finalize()
    if plain[0] != 0xC7:
        raise ValueError("Unsupported PICC flags or UID length")
    uid, counter_bytes = plain[1:8], plain[8:11]
    session = cmac(file_key, bytes.fromhex("3cc300010080") + uid + counter_bytes)
    if not compare_digest(cmac(session, mac_input)[1::2], received):
        raise ValueError("Invalid MAC")
    counter = int.from_bytes(counter_bytes, "little")
    if counter == 0xFFFFFF:
        raise ValueError("Counter exhausted; retire tag")
    return Tap(uid.hex(), counter)
