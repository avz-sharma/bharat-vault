"""Durable local/PostgreSQL records. SQLite is a local-demo adapter only."""

from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    Integer,
    MetaData,
    String,
    Table,
    UniqueConstraint,
    create_engine,
    event,
    select,
    update,
)

metadata = MetaData()
challenges = Table(
    "auth_challenges",
    metadata,
    Column("id", String, primary_key=True),
    Column("identity", String, nullable=False),
    Column("controller", String, nullable=False),
    Column("changed", String),
    Column("message", String, nullable=False),
    Column("expires", BigInteger),
    Column("consumed", Boolean, nullable=False, default=False),
)
links = Table(
    "verified_identity_links",
    metadata,
    Column("id", String, primary_key=True),
    Column("identity", String, unique=True, nullable=False),
    Column("did", String, unique=True, nullable=False),
    Column("controller", String, nullable=False),
    Column("verified_at", BigInteger),
)
sessions = Table(
    "auth_sessions",
    metadata,
    Column("token_hash", String, primary_key=True),
    Column("link_id", String),
    Column("identity", String, nullable=False),
    Column("controller", String),
    Column("changed", String),
    Column("expires", BigInteger),
)
bindings = Table(
    "chip_bindings",
    metadata,
    Column("uid", String, primary_key=True),
    Column("chain", String, nullable=False),
    Column("contract", String, nullable=False),
    Column("token", String, nullable=False),
    Column("commitment", String, unique=True, nullable=False),
    Column("version", Integer, nullable=False),
    Column("key_ref", String),
    Column("counter", Integer, nullable=False, default=-1),
    Column("confirmed", Boolean, nullable=False, default=False),
    UniqueConstraint("chain", "contract", "token"),
)
verifications = Table(
    "tap_verifications",
    metadata,
    Column("operation", String, primary_key=True),
    Column("uid", String),
    Column("counter", Integer),
    Column("context", String, nullable=False),
    Column("result", JSON, nullable=False),
    Column("expires", BigInteger),
    UniqueConstraint("uid", "counter"),
)
blocks = Table(
    "indexed_blocks",
    metadata,
    Column("number", BigInteger, primary_key=True),
    Column("hash", String, nullable=False),
    Column("parent", String, nullable=False),
)
events = Table(
    "chain_events",
    metadata,
    Column("tx", String, primary_key=True),
    Column("log_index", Integer, primary_key=True),
    Column("block", BigInteger),
    Column("block_hash", String),
    Column("contract", String),
    Column("name", String),
    Column("args", JSON),
)
ownership = Table(
    "asset_projection",
    metadata,
    Column("token", String, primary_key=True),
    Column("identity", String, nullable=False),
    Column("block", BigInteger),
)
checkpoints = Table(
    "indexer_checkpoint",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("deployment", String, nullable=False),
    Column("number", BigInteger),
)


def now() -> int:
    return int(datetime.now(UTC).timestamp())


class Store:
    def __init__(self, url: str):
        self.engine = create_engine(url, pool_pre_ping=True)
        if url.startswith("sqlite"):

            @event.listens_for(self.engine, "connect")
            def configure(connection, _):
                connection.execute("PRAGMA busy_timeout=15000")
                connection.execute("PRAGMA journal_mode=WAL")

        metadata.create_all(self.engine)

    @contextmanager
    def transaction(self):
        with self.engine.connect() as connection:
            if self.engine.dialect.name == "sqlite":
                connection.exec_driver_sql("BEGIN IMMEDIATE")
            else:
                connection.begin()
            try:
                yield connection
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def register_chip(self, **values):
        # No UPSERT: duplicate UID/token/commitment must never reset counters.
        with self.transaction() as db:
            db.execute(bindings.insert().values(**values, counter=-1, confirmed=False))

    def confirm_binding(self, uid: str, chain_binding: dict):
        with self.transaction() as db:
            row = (
                db.execute(select(bindings).where(bindings.c.uid == uid))
                .mappings()
                .one()
            )
            for key in ("chain", "contract", "token", "commitment", "version"):
                if row[key] != chain_binding[key]:
                    raise ValueError("Binding differs from confirmed chain state")
            db.execute(
                update(bindings).where(bindings.c.uid == uid).values(confirmed=True)
            )

    def consume_tap(self, uid, counter, operation, context, result, expires):
        if not 0 <= counter < 0xFFFFFF or expires <= now():
            raise ValueError("Expired verification or exhausted counter")
        with self.transaction() as db:
            binding = (
                db.execute(
                    select(bindings).where(bindings.c.uid == uid).with_for_update()
                )
                .mappings()
                .first()
            )
            if not binding or not binding["confirmed"]:
                raise ValueError("Unknown or unconfirmed binding")
            previous = (
                db.execute(
                    select(verifications).where(verifications.c.operation == operation)
                )
                .mappings()
                .first()
            )
            if previous:
                if (
                    previous["context"] != context
                    or previous["uid"] != uid
                    or previous["counter"] != counter
                    or previous["expires"] <= now()
                ):
                    raise ValueError("Operation conflict or expired retry")
                return previous["result"]
            changed = db.execute(
                update(bindings)
                .where(
                    bindings.c.uid == uid,
                    bindings.c.counter < counter,
                    bindings.c.confirmed.is_(True),
                )
                .values(counter=counter)
            )
            if changed.rowcount != 1:
                raise ValueError("Replay or counter rollback")
            db.execute(
                verifications.insert().values(
                    operation=operation,
                    uid=uid,
                    counter=counter,
                    context=context,
                    result=result,
                    expires=expires,
                )
            )
            return result
