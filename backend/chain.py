"""Read-only RPC adapter using only deployment-configured addresses and endpoints."""

import json
from pathlib import Path

import httpx
from eth_abi import decode, encode
from eth_account import Account
from eth_account.messages import defunct_hash_message, encode_defunct
from eth_utils import keccak


class Chain:
    def __init__(self, manifest: dict, rpc_url: str):
        self.manifest = manifest
        self.rpc_url = rpc_url
        self.chain_id = manifest["chainId"]
        self.contracts = manifest["contracts"]

    def rpc(self, method, params):
        with httpx.Client(timeout=10, follow_redirects=False) as client:
            response = client.post(
                self.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": method,
                    "params": params,
                },
            )
            response.raise_for_status()
            payload = response.json()
            if "error" in payload or "result" not in payload:
                raise RuntimeError("Chain RPC failed")
            return payload["result"]

    def check(self):
        if int(self.rpc("eth_chainId", []), 16) != self.chain_id:
            raise RuntimeError("Wrong RPC chain")
        for contract in self.contracts.values():
            code = self.rpc("eth_getCode", [contract["address"], "latest"])
            if (
                code == "0x"
                or "0x" + keccak(bytes.fromhex(code[2:])).hex() != contract["codeHash"]
            ):
                raise RuntimeError("Missing or mismatched deployment bytecode")

    def call(self, contract, signature, types, args, returns, block="latest"):
        data = keccak(text=signature)[:4] + encode(types, args)
        result = self.rpc(
            "eth_call", [{"to": contract, "data": "0x" + data.hex()}, block]
        )
        return decode(returns, bytes.fromhex(result[2:]))

    def identity_state(self, identity):
        self.check()
        block = self.rpc("eth_blockNumber", [])
        did = self.contracts["didRegistry"]["address"]
        registry = self.contracts["identityRegistry"]["address"]
        (controller,) = self.call(
            did, "identityOwner(address)", ["address"], [identity], ["address"], block
        )
        (changed,) = self.call(
            did, "changed(address)", ["address"], [identity], ["uint256"], block
        )
        (active,) = self.call(
            registry, "active(address)", ["address"], [identity], ["bool"], block
        )
        return controller.lower(), str(changed), active

    def verify_signature(self, controller, message, signature):
        if self.rpc("eth_getCode", [controller, "latest"]) != "0x":
            (magic,) = self.call(
                controller,
                "isValidSignature(bytes32,bytes)",
                ["bytes32", "bytes"],
                [
                    defunct_hash_message(text=message),
                    bytes.fromhex(signature.removeprefix("0x")),
                ],
                ["bytes4"],
            )
            return magic == bytes.fromhex("1626ba7e")
        recovered = Account.recover_message(
            encode_defunct(text=message), signature=signature
        )
        return recovered.lower() == controller.lower()


def load_manifest(path):
    manifest = json.loads(Path(path).read_text())
    if manifest.get("abiVersion") != 1 or not manifest.get("contracts"):
        raise ValueError("Missing deployment; run npm run deploy:local first")
    return manifest
