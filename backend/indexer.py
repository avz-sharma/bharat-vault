"""Confirmed, deployment-scoped chain projection with canonical rollback."""

import json
from pathlib import Path

from eth_abi import decode
from eth_utils import event_abi_to_log_topic
from sqlalchemy import delete, select, update

from backend.store import blocks, checkpoints, events, ownership


def json_value(value):
    if isinstance(value, bytes):
        return "0x" + value.hex()
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return str(value)
    return value


class Indexer:
    def __init__(self, store, chain, abi_path="shared/abis.json"):
        self.store, self.chain = store, chain
        self.start = int(chain.manifest["startBlock"])
        self.confirmations = int(chain.manifest["confirmations"])
        if self.confirmations < 1:
            raise ValueError("At least one inclusion confirmation required")
        abis = json.loads(Path(abi_path).read_text())
        self.decoders = {}
        for name, contract in chain.contracts.items():
            self.decoders[contract["address"].lower()] = {
                "0x" + event_abi_to_log_topic(abi).hex(): abi
                for abi in abis[name]
                if abi["type"] == "event"
            }
        self.deployment = json.dumps(chain.manifest, sort_keys=True)
        with store.transaction() as db:
            old = db.execute(select(checkpoints)).mappings().first()
            if old and old["deployment"] != self.deployment:
                raise ValueError("Use a separate database for a different deployment")
            if not old:
                db.execute(
                    checkpoints.insert().values(
                        id=1, deployment=self.deployment, number=self.start - 1
                    )
                )

    def decode_log(self, log):
        abi = self.decoders.get(log["address"].lower(), {}).get(log["topics"][0])
        if not abi:
            return None
        indexed = [v for v in abi["inputs"] if v["indexed"]]
        normal = [v for v in abi["inputs"] if not v["indexed"]]
        args = {}
        for item, topic in zip(indexed, log["topics"][1:], strict=True):
            args[item["name"]] = json_value(
                decode([item["type"]], bytes.fromhex(topic[2:]))[0]
            )
        values = decode([v["type"] for v in normal], bytes.fromhex(log["data"][2:]))
        args.update(
            {v["name"]: json_value(x) for v, x in zip(normal, values, strict=True)}
        )
        return dict(
            tx=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            block=int(log["blockNumber"], 16),
            block_hash=log["blockHash"],
            contract=log["address"].lower(),
            name=abi["name"],
            args=args,
        )

    def _project(self, db, event):
        if (
            event["name"] != "Transfer"
            or event["contract"] != self.chain.contracts["assetNFT"]["address"].lower()
        ):
            return
        token = event["args"]["tokenId"]
        db.execute(delete(ownership).where(ownership.c.token == token))
        recipient = event["args"]["to"].lower()
        if int(recipient, 16):
            db.execute(
                ownership.insert().values(
                    token=token, identity=recipient, block=event["block"]
                )
            )

    def apply_block(self, block, logs):
        number = int(block["number"], 16)
        with self.store.transaction() as db:
            checkpoint = (
                db.execute(select(checkpoints).with_for_update()).mappings().one()
            )
            existing = (
                db.execute(select(blocks).where(blocks.c.number == number))
                .mappings()
                .first()
            )
            if existing and existing["hash"] == block["hash"]:
                return
            if number != checkpoint["number"] + 1:
                raise ValueError("Out-of-order block")
            prior = (
                db.execute(select(blocks).where(blocks.c.number == number - 1))
                .mappings()
                .first()
            )
            if prior and prior["hash"] != block["parentHash"]:
                raise ValueError("Parent mismatch")
            db.execute(
                blocks.insert().values(
                    number=number, hash=block["hash"], parent=block["parentHash"]
                )
            )
            seen = set()
            for log in sorted(logs, key=lambda v: int(v["logIndex"], 16)):
                if (
                    log.get("removed")
                    or log["blockHash"] != block["hash"]
                    or int(log["blockNumber"], 16) != number
                ):
                    raise ValueError("Noncanonical log")
                record = self.decode_log(log)
                if not record:
                    continue
                key = (record["tx"], record["log_index"])
                if key in seen:
                    continue
                seen.add(key)
                db.execute(events.insert().values(**record))
                self._project(db, record)
            db.execute(
                update(checkpoints).where(checkpoints.c.id == 1).values(number=number)
            )

    def rollback(self, from_block):
        with self.store.transaction() as db:
            db.execute(select(checkpoints).with_for_update()).one()
            db.execute(delete(events).where(events.c.block >= from_block))
            db.execute(delete(blocks).where(blocks.c.number >= from_block))
            db.execute(delete(ownership))
            for record in db.execute(
                select(events).order_by(events.c.block, events.c.log_index)
            ).mappings():
                self._project(db, record)
            db.execute(
                update(checkpoints)
                .where(checkpoints.c.id == 1)
                .values(number=from_block - 1)
            )

    def sync(self, max_blocks=1000):
        self.chain.check()
        head = int(self.chain.rpc("eth_blockNumber", []), 16)
        target = head - self.confirmations + 1
        while True:
            with self.store.engine.connect() as db:
                tip = (
                    db.execute(select(blocks).order_by(blocks.c.number.desc()).limit(1))
                    .mappings()
                    .first()
                )
            if not tip:
                break
            canonical = self.chain.rpc(
                "eth_getBlockByNumber", [hex(tip["number"]), False]
            )
            if (
                canonical
                and canonical["hash"] == tip["hash"]
                and tip["number"] <= target
            ):
                break
            self.rollback(tip["number"])
        start = tip["number"] + 1 if tip else self.start
        for number in range(start, min(target + 1, start + max_blocks)):
            block = self.chain.rpc("eth_getBlockByNumber", [hex(number), False])
            logs = self.chain.rpc(
                "eth_getLogs",
                [
                    {
                        "blockHash": block["hash"],
                        "address": list(self.decoders),
                    }
                ],
            )
            self.apply_block(block, logs)
        return target


if __name__ == "__main__":
    import argparse
    import os
    import time

    from backend.chain import Chain, load_manifest
    from backend.store import Store

    manifest = load_manifest(os.environ.get("VAULT_MANIFEST", "deployments/31337.json"))
    chain = Chain(manifest, os.environ.get("VAULT_RPC_URL", "http://127.0.0.1:8545"))
    store = Store(os.environ.get("VAULT_DATABASE_URL", "sqlite:///vault-local.db"))
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", action="store_true")
    options = parser.parse_args()
    indexer = Indexer(store, chain)
    while True:
        target = indexer.sync()
        if not options.watch:
            print("Confirmed target:", target)
            break
        time.sleep(2)
