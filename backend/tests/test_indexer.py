from types import SimpleNamespace

import pytest
from eth_abi import encode
from eth_utils import keccak
from sqlalchemy import select

from backend.indexer import Indexer
from backend.store import Store, checkpoints, events, ownership

CONTRACT = "0x" + "a" * 40
ALICE = "0x" + "b" * 40
BOB = "0x" + "c" * 40
ZERO = "0x" + "0" * 40


def block(number, value, parent):
    return {"number": hex(number), "hash": value, "parentHash": parent}


def transfer(number, block_hash, sender, recipient, token=7, index=0):
    return {
        "address": CONTRACT,
        "blockNumber": hex(number),
        "blockHash": block_hash,
        "transactionHash": f"tx-{block_hash}-{index}",
        "logIndex": hex(index),
        "data": "0x",
        "topics": [
            "0x" + keccak(text="Transfer(address,address,uint256)").hex(),
            "0x" + encode(["address"], [sender]).hex(),
            "0x" + encode(["address"], [recipient]).hex(),
            "0x" + encode(["uint256"], [token]).hex(),
        ],
    }


@pytest.fixture
def indexed(tmp_path):
    store = Store(f"sqlite:///{tmp_path / 'events.db'}")
    contracts = {
        "assetNFT": {"address": CONTRACT},
        "didRegistry": {"address": ZERO},
        "identityRegistry": {"address": "0x" + "d" * 40},
    }
    manifest = {
        "startBlock": "1",
        "confirmations": 1,
        "contracts": contracts,
        "chainId": 31337,
    }
    chain = SimpleNamespace(contracts=contracts, manifest=manifest, check=lambda: None)
    yield store, chain, Indexer(store, chain)
    store.engine.dispose()


def test_retry_order_restart_and_reorg(indexed):
    store, chain, index = indexed
    first = block(1, "block-one", "genesis")
    mint = transfer(1, "block-one", ZERO, ALICE, token=9007199254740993)
    index.apply_block(first, [mint, mint])
    index.apply_block(first, [mint])
    with pytest.raises(ValueError, match="Out-of-order"):
        index.apply_block(block(3, "third", "second"), [])
    index = Indexer(store, chain)  # restart from durable checkpoint
    index.apply_block(
        block(2, "old-two", "block-one"),
        [transfer(2, "old-two", ALICE, BOB, 9007199254740993)],
    )
    with store.engine.connect() as db:
        assert db.execute(select(ownership.c.identity)).scalar_one() == BOB
    index.rollback(2)
    with store.engine.connect() as db:
        row = db.execute(select(ownership)).mappings().one()
        assert row["identity"] == ALICE and row["token"] == "9007199254740993"
        assert len(db.execute(select(events)).all()) == 1
    index.apply_block(block(2, "new-two", "block-one"), [])
    with store.engine.connect() as db:
        assert db.execute(select(checkpoints.c.number)).scalar_one() == 2


def test_invalid_log_rolls_back_entire_batch(indexed):
    store, _, index = indexed
    with pytest.raises(ValueError, match="Noncanonical"):
        index.apply_block(
            block(1, "one", "genesis"),
            [transfer(1, "one", ZERO, ALICE), transfer(1, "wrong", ZERO, BOB, 8, 1)],
        )
    with store.engine.connect() as db:
        assert not db.execute(select(events)).all()
        assert db.execute(select(checkpoints.c.number)).scalar_one() == 0


def test_sync_rolls_back_removed_tip_and_respects_confirmations(indexed):
    store, chain, index = indexed
    canonical = {
        1: block(1, "one", "genesis"),
        2: block(2, "two", "one"),
        3: block(3, "three", "two"),
    }
    logs = {
        "one": [transfer(1, "one", ZERO, ALICE)],
        "two": [transfer(2, "two", ALICE, BOB)],
        "three": [],
    }

    def rpc(method, params):
        if method == "eth_blockNumber":
            return "0x3"
        if method == "eth_getBlockByNumber":
            return canonical.get(int(params[0], 16))
        if method == "eth_getLogs":
            return logs[params[0]["blockHash"]]
        raise AssertionError(method)

    chain.rpc = rpc
    index.confirmations = 2
    index.sync()
    with store.engine.connect() as db:
        assert db.execute(select(checkpoints.c.number)).scalar_one() == 2
        assert db.execute(select(ownership.c.identity)).scalar_one() == BOB
    canonical[2] = block(2, "replacement", "one")
    logs["replacement"] = []
    index.sync()
    with store.engine.connect() as db:
        assert db.execute(select(ownership.c.identity)).scalar_one() == ALICE


def test_wrong_deployment_database_rejected(indexed):
    store, chain, _ = indexed
    chain.manifest = chain.manifest | {"chainId": 80002}
    with pytest.raises(ValueError, match="different deployment"):
        Indexer(store, chain)
