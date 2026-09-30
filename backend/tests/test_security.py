from concurrent.futures import ThreadPoolExecutor

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from backend.app import create_app
from backend.auth import Auth
from backend.nfc import cmac, verify_tap
from backend.store import Store, bindings, challenges, now, sessions

KEY = bytes(16)
PICC = "EF963FF7828658A599F3041510671E88"
MAC = "94EED9EE65337086"


def test_independent_nxp_vectors():
    tap = verify_tap(PICC, MAC, KEY, KEY)
    assert tap.uid == "04de5f1eacc040" and tap.counter == 61
    assert (
        cmac(
            bytes.fromhex("5ACE7E50AB65D5D51FD5BF5A16B8205B"),
            bytes.fromhex("3CC30001008004C767F2066180010000"),
        ).hex()
        == "3a3e8110e05311f7a3fcf0d969bf2b48"
    )
    second = verify_tap(
        "FD91EC264309878BE6345CBE53BADF40",
        "ECC1E7F6C6C73BF6",
        KEY,
        KEY,
        mac_input=b"CEE9A53E3E463EF1F459635736738962&cmac=",
    )
    assert second.uid == "04958caa5c5e80" and second.counter == 8


@pytest.mark.parametrize(
    "picc,mac,key,data",
    [
        ("00", MAC, KEY, b""),
        (PICC, "xx" * 8, KEY, b""),
        (PICC, "00" * 8, KEY, b""),
        (PICC, MAC, b"a" * 16, b""),
        (PICC, MAC, KEY, b"changed-ndef-input"),
        (PICC, MAC, b"a", b""),
    ],
)
def test_bad_nfc_input(picc, mac, key, data):
    with pytest.raises(ValueError):
        verify_tap(picc, mac, key, key, mac_input=data)


@pytest.fixture
def store(tmp_path):
    value = Store(f"sqlite:///{tmp_path / 'vault.db'}")
    yield value
    value.engine.dispose()


def register(store, uid="test-private-uid"):
    values = dict(
        uid=uid,
        chain="31337",
        contract="0xabc",
        token="9007199254740993",
        commitment="0xcommitment",
        version=1,
        key_ref="secret-manager/key-v1",
    )
    store.register_chip(**values)
    store.confirm_binding(uid, values)
    return values


def consume(
    store,
    operation="operation",
    counter=61,
    context="authenticated-recipient:request-7",
):
    return store.consume_tap(
        "test-private-uid",
        counter,
        operation,
        context,
        {"cryptogram": True, "eligible": False},
        now() + 60,
    )


def test_durable_replay_and_binding_reset_denied(store):
    values = register(store)
    accepted = consume(store)
    assert consume(store) == accepted  # same authenticated operation is idempotent
    reopened = Store(str(store.engine.url))
    with pytest.raises(ValueError, match="Replay"):
        consume(reopened, "different-operation")
    with pytest.raises(ValueError, match="conflict"):
        consume(store, context="other-recipient")
    with pytest.raises(IntegrityError):
        store.register_chip(**(values | {"token": "other-token"}))
    with pytest.raises(ValueError):
        consume(store, "lower-counter", 60)
    with pytest.raises(ValueError):
        consume(store, "exhausted", 0xFFFFFF)
    reopened.engine.dispose()


def test_atomic_multiworker_counter(store):
    register(store)

    def attempt(index):
        worker = Store(str(store.engine.url))
        try:
            consume(worker, f"worker-{index}")
            return True
        except ValueError:
            return False
        finally:
            worker.engine.dispose()

    with ThreadPoolExecutor(max_workers=8) as executor:
        assert sum(executor.map(attempt, range(8))) == 1
    with store.engine.connect() as db:
        assert db.execute(select(bindings.c.counter)).scalar_one() == 61


def test_unknown_unconfirmed_and_mismatched_binding(store):
    with pytest.raises(ValueError):
        consume(store)
    values = dict(
        uid="test-private-uid",
        chain="31337",
        contract="0xabc",
        token="7",
        commitment="commitment",
        version=1,
        key_ref="secret-key-ref",
    )
    store.register_chip(**values)
    with pytest.raises(ValueError):
        consume(store)
    with pytest.raises(ValueError):
        store.confirm_binding(values["uid"], values | {"chain": "80002"})


class TestChain:
    __test__ = False
    chain_id = 31337
    contracts = {"identityRegistry": {"address": "0x" + "ab" * 20}}
    changed = "0"
    active = True

    def __init__(self):
        self.key = Account.create()
        self.controller = self.key.address.lower()

    def check(self):
        pass

    def identity_state(self, _):
        return self.controller, self.changed, self.active

    def verify_signature(self, controller, message, signature):
        return (
            Account.recover_message(
                encode_defunct(text=message), signature=signature
            ).lower()
            == controller
        )

    def sign(self, message):
        return (
            "0x" + self.key.sign_message(encode_defunct(text=message)).signature.hex()
        )


def test_auth_nonce_wrong_chain_wrong_audience_stale_controller(store):
    chain = TestChain()
    auth = Auth(store, chain, "https://vault.example")
    with pytest.raises(ValueError, match="Wrong chain"):
        auth.challenge(chain.controller, 80002)
    challenge = auth.challenge(chain.controller, 31337)
    with pytest.raises(ValueError):
        auth.login(
            challenge["id"],
            chain.sign(challenge["message"].replace("vault.example", "other.example")),
        )
    result = auth.login(challenge["id"], chain.sign(challenge["message"]))
    assert auth.authenticate(result["token"])["identity"] == chain.controller
    with pytest.raises(ValueError, match="consumed"):
        auth.login(challenge["id"], chain.sign(challenge["message"]))
    chain.controller = Account.create().address.lower()
    with pytest.raises(ValueError, match="invalidated"):
        auth.authenticate(result["token"])
    with pytest.raises(ValueError):
        auth.authenticate("made-up-token")


def test_auth_expiry_suspension_and_rotation_back(store):
    chain = TestChain()
    auth = Auth(store, chain, "https://vault.example")
    challenge = auth.challenge(chain.controller, 31337)
    with store.transaction() as db:
        db.execute(update(challenges).values(expires=now() - 1))
    with pytest.raises(ValueError):
        auth.login(challenge["id"], chain.sign(challenge["message"]))
    challenge = auth.challenge(chain.controller, 31337)
    result = auth.login(challenge["id"], chain.sign(challenge["message"]))
    chain.changed = "42"
    with pytest.raises(ValueError):
        auth.authenticate(result["token"])
    chain.changed = "0"
    chain.active = False
    with pytest.raises(ValueError):
        auth.authenticate(result["token"])
    chain.active = True
    with store.transaction() as db:
        db.execute(update(sessions).values(expires=now() - 1))
    with pytest.raises(ValueError):
        auth.authenticate(result["token"])


def test_api_no_mock_no_provisioning_or_false_physical_result(store):
    with TestClient(create_app(store, TestChain(), "http://testserver")) as client:
        assert client.post("/api/v1/assets/mock-tap", json={}).status_code == 404
        assert client.post("/api/v1/assets/register-chip", json={}).status_code == 404
        response = client.post("/api/v1/assets/verify-physical")
        assert response.status_code == 503 and not response.json()["detail"]["eligible"]
        assert client.get("/api/v1/auth/me").status_code == 401
        assert (
            client.post(
                "/api/v1/auth/challenge", json={"identity": "x", "chain_id": 1}
            ).status_code
            == 422
        )


def test_real_mode_cannot_start_without_hardware_gate(store, monkeypatch):
    monkeypatch.setenv("VAULT_PHYSICAL_ENABLED", "true")
    with pytest.raises(RuntimeError, match="hardware"):
        with TestClient(create_app(store, TestChain())):
            pass


def test_cors_uses_exact_application_audience(store):
    audience = "http://127.0.0.1:3000"
    with TestClient(create_app(store, TestChain(), audience)) as client:
        response = client.options(
            "/api/v1/auth/challenge",
            headers={
                "Origin": audience,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == audience
        denied = client.options(
            "/api/v1/auth/challenge",
            headers={
                "Origin": "https://other.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert denied.status_code == 400
