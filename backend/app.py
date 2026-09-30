import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from backend.auth import Auth
from backend.chain import Chain, load_manifest
from backend.store import Store, blocks, checkpoints, events, ownership


class ChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identity: str = Field(pattern=r"^0x[0-9a-fA-F]{40}$")
    chain_id: int = Field(gt=0)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=20, max_length=100)
    signature: str = Field(pattern=r"^0x[0-9a-fA-F]+$", max_length=8194)


def create_app(store=None, chain=None, audience=None):
    @asynccontextmanager
    async def lifespan(app):
        nonlocal store, chain, audience
        if os.environ.get("VAULT_PHYSICAL_ENABLED", "false").lower() != "false":
            raise RuntimeError(
                "Real NFC service is gated on independent hardware validation"
            )
        audience = audience or os.environ.get("VAULT_AUDIENCE", "http://127.0.0.1:3000")
        if store is None:
            url = os.environ.get("VAULT_DATABASE_URL", "sqlite:///vault-local.db")
            if os.environ.get("VAULT_MODE", "local") != "local" and not url.startswith(
                "postgresql+psycopg://"
            ):
                raise RuntimeError("Production requires a PostgreSQL database")
            store = Store(url)
        if chain is None:
            manifest = load_manifest(
                os.environ.get("VAULT_MANIFEST", "deployments/31337.json")
            )
            chain = Chain(
                manifest, os.environ.get("VAULT_RPC_URL", "http://127.0.0.1:8545")
            )
        chain.check()
        app.state.auth = Auth(store, chain, audience)
        yield

    app = FastAPI(title="Bharat Vault", version="2.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            audience or os.environ.get("VAULT_AUDIENCE", "http://127.0.0.1:3000")
        ],
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(ValueError)
    async def invalid_request(_, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.get("/api/v1/health")
    def health():
        try:
            chain.check()
        except Exception as exc:
            raise HTTPException(503, "Configured chain unavailable") from exc
        with store.engine.connect() as db:
            tip = (
                db.execute(select(blocks).order_by(blocks.c.number.desc()).limit(1))
                .mappings()
                .first()
            )
        return {
            "chain_id": chain.chain_id,
            "deployment": chain.contracts,
            "indexed_block": str(tip["number"]) if tip else None,
            "physical": "unavailable: hardware validation required",
            "credentials": "unavailable: issuance is not enabled",
        }

    @app.post("/api/v1/auth/challenge")
    def challenge(body: ChallengeRequest):
        return app.state.auth.challenge(body.identity, body.chain_id)

    @app.post("/api/v1/auth/login")
    def login(body: LoginRequest):
        return app.state.auth.login(body.id, body.signature)

    @app.get("/api/v1/auth/me")
    def me(authorization: str = Header(default="")):
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Session required")
        try:
            session = app.state.auth.authenticate(authorization[7:])
        except ValueError as exc:
            raise HTTPException(401, str(exc)) from exc
        return {
            "identity": session["identity"],
            "user_id": session["link_id"],
            "expires": session["expires"],
        }

    def require_index(db):
        # Serialize the checkpoint and its projection as one response snapshot.
        db.execute(select(checkpoints).with_for_update()).first()
        tip = (
            db.execute(select(blocks).order_by(blocks.c.number.desc()).limit(1))
            .mappings()
            .first()
        )
        if not tip:
            raise HTTPException(503, "Index unavailable; run the indexer")
        canonical = chain.rpc("eth_getBlockByNumber", [hex(tip["number"]), False])
        if not canonical or canonical["hash"] != tip["hash"]:
            raise HTTPException(
                503, "Reorganization detected; index reconciliation required"
            )
        return {
            "block": str(tip["number"]),
            "block_hash": tip["hash"],
            "chain_id": chain.chain_id,
            "contract": chain.contracts["assetNFT"]["address"],
        }

    @app.get("/api/v1/assets")
    def inventory(
        identity: str = Query(pattern=r"^0x[0-9a-fA-F]{40}$"),
        offset: int = Query(0, ge=0),
        limit: int = Query(20, ge=1, le=100),
    ):
        with store.transaction() as db:
            proof = require_index(db)
            rows = (
                db.execute(
                    select(ownership)
                    .where(ownership.c.identity == identity.lower())
                    .order_by(ownership.c.token)
                    .offset(offset)
                    .limit(limit + 1)
                )
                .mappings()
                .all()
            )
        return {
            **proof,
            "items": [dict(r) | {"block": str(r["block"])} for r in rows[:limit]],
            "next_offset": offset + limit if len(rows) > limit else None,
        }

    @app.get("/api/v1/events")
    def history(offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100)):
        with store.transaction() as db:
            proof = require_index(db)
            rows = (
                db.execute(
                    select(events)
                    .order_by(events.c.block.desc(), events.c.log_index.desc())
                    .offset(offset)
                    .limit(limit + 1)
                )
                .mappings()
                .all()
            )
        return {
            **proof,
            "items": [dict(r) | {"block": str(r["block"])} for r in rows[:limit]],
            "next_offset": offset + limit if len(rows) > limit else None,
        }

    @app.post("/api/v1/assets/verify-physical")
    def physical():
        raise HTTPException(
            503,
            detail={
                "eligible": False,
                "checks": {
                    "cryptogram": "unavailable",
                    "binding": "unavailable",
                    "ownership": "unavailable",
                    "permission": "unavailable",
                    "freshness": "unavailable",
                    "completion": "not submitted",
                },
                "reason": (
                    "Physical handover is not enabled; "
                    "published vector tests do not validate hardware."
                ),
            },
        )

    return app


app = create_app()
