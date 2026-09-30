import hashlib
import secrets
import uuid

from sqlalchemy import select, update

from backend.store import challenges, links, now, sessions


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


class Auth:
    def __init__(self, store, chain, audience):
        self.store, self.chain, self.audience = store, chain, audience

    def challenge(self, identity, chain_id):
        if chain_id != self.chain.chain_id:
            raise ValueError("Wrong chain")
        identity = identity.lower()
        controller, changed, active = self.chain.identity_state(identity)
        if not active:
            raise ValueError("Identity is not active")
        nonce, expiry = secrets.token_urlsafe(32), now() + 300
        did = f"did:ethr:0x{chain_id:x}:{identity}"
        message = (
            f"Bharat Vault authentication\nAudience: {self.audience}\n"
            f"DID: {did}\nController: {controller}\n"
            f"Registry: {self.chain.contracts['identityRegistry']['address']}\n"
            f"Nonce: {nonce}\nExpires: {expiry}\n"
            "Sign in only. This does not authorize an asset transfer."
        )
        with self.store.transaction() as db:
            db.execute(
                challenges.insert().values(
                    id=nonce,
                    identity=identity,
                    controller=controller,
                    changed=changed,
                    message=message,
                    expires=expiry,
                    consumed=False,
                )
            )
        return {"id": nonce, "message": message, "expires": expiry}

    def login(self, nonce, signature):
        with self.store.transaction() as db:
            row = (
                db.execute(
                    select(challenges).where(challenges.c.id == nonce).with_for_update()
                )
                .mappings()
                .first()
            )
            if not row or row["consumed"] or row["expires"] <= now():
                raise ValueError("Expired or consumed challenge")
            controller, changed, active = self.chain.identity_state(row["identity"])
            if (
                not active
                or controller != row["controller"]
                or changed != row["changed"]
                or not self.chain.verify_signature(
                    controller, row["message"], signature
                )
            ):
                raise ValueError("Controller proof rejected")
            consumed = db.execute(
                update(challenges)
                .where(
                    challenges.c.id == nonce,
                    challenges.c.consumed.is_(False),
                )
                .values(consumed=True)
            )
            if consumed.rowcount != 1:
                raise ValueError("Challenge already consumed")
            identity = row["identity"]
            link = (
                db.execute(select(links).where(links.c.identity == identity))
                .mappings()
                .first()
            )
            link_id = link["id"] if link else str(uuid.uuid4())
            if not link:
                db.execute(
                    links.insert().values(
                        id=link_id,
                        identity=identity,
                        did=f"did:ethr:0x{self.chain.chain_id:x}:{identity}",
                        controller=controller,
                        verified_at=now(),
                    )
                )
            else:
                db.execute(
                    update(links)
                    .where(links.c.id == link_id)
                    .values(controller=controller, verified_at=now())
                )
            token, expiry = secrets.token_urlsafe(32), now() + 900
            db.execute(
                sessions.insert().values(
                    token_hash=token_hash(token),
                    link_id=link_id,
                    identity=identity,
                    controller=controller,
                    changed=changed,
                    expires=expiry,
                )
            )
        return {
            "token": token,
            "expires": expiry,
            "identity": identity,
            "user_id": link_id,
        }

    def authenticate(self, token):
        with self.store.engine.connect() as db:
            row = (
                db.execute(
                    select(sessions).where(sessions.c.token_hash == token_hash(token))
                )
                .mappings()
                .first()
            )
        if not row or row["expires"] <= now():
            raise ValueError("Expired or unknown session")
        controller, changed, active = self.chain.identity_state(row["identity"])
        if not active or controller != row["controller"] or changed != row["changed"]:
            raise ValueError("Session invalidated by identity change")
        return dict(row)
