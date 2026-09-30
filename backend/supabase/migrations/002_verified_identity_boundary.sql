-- Existing credential rows are quarantined until verified links and encryption exist.
-- Never infer identity control from editable profile metadata or a DID string.
BEGIN;
DROP POLICY IF EXISTS "Holders can view their own credentials" ON credentials;
DROP POLICY IF EXISTS "Users can view their related audit events" ON audit_events;

CREATE TABLE auth_identity_links (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    chain_id numeric(78,0) NOT NULL,
    did text NOT NULL,
    controller text NOT NULL CHECK (controller ~ '^0x[0-9a-fA-F]{40}$'),
    proof_time timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked boolean NOT NULL DEFAULT false,
    UNIQUE (user_id, did)
);
CREATE INDEX identity_links_session ON auth_identity_links(user_id, did);
ALTER TABLE auth_identity_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_identity_links FROM anon, authenticated;
GRANT SELECT ON auth_identity_links TO authenticated;
GRANT ALL ON auth_identity_links TO service_role;
CREATE POLICY own_verified_links ON auth_identity_links FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND NOT revoked AND expires_at > now());

ALTER TABLE credentials ADD COLUMN identity_link_id uuid REFERENCES auth_identity_links(id);
ALTER TABLE credentials ADD COLUMN encrypted_payload bytea;
ALTER TABLE credentials ADD COLUMN encryption_key_ref text;
ALTER TABLE credentials ADD COLUMN schema_version integer NOT NULL DEFAULT 1;
ALTER TABLE credentials ADD COLUMN purge_after timestamptz;
REVOKE ALL ON credentials FROM anon, authenticated;
GRANT SELECT (id, identity_link_id, issuer_did, is_revoked, issued_at, expires_at, schema_version)
    ON credentials TO authenticated;
GRANT ALL ON credentials TO service_role;
CREATE POLICY verified_holder_credentials ON credentials FOR SELECT TO authenticated USING (
    NOT is_revoked AND (expires_at IS NULL OR expires_at > now())
    AND EXISTS (SELECT 1 FROM auth_identity_links l WHERE l.id = identity_link_id
        AND l.user_id = auth.uid() AND NOT l.revoked AND l.expires_at > now())
);
-- Ciphertext and legacy plaintext are never exposed by direct client table reads.
-- A future credential service must check the current chain controller before decryption.
REVOKE ALL ON audit_events FROM anon, authenticated;
GRANT ALL ON audit_events TO service_role;

CREATE TABLE confirmed_chain_events (
    chain_id numeric(78,0) NOT NULL,
    contract text NOT NULL,
    transaction_hash text NOT NULL,
    log_index integer NOT NULL,
    block_number bigint NOT NULL,
    block_hash text NOT NULL,
    event_type text NOT NULL,
    public_payload jsonb NOT NULL,
    confirmation_state text NOT NULL CHECK (confirmation_state IN ('pending','confirmed','orphaned')),
    PRIMARY KEY(chain_id, contract, transaction_hash, log_index)
);
CREATE INDEX confirmed_event_blocks ON confirmed_chain_events(chain_id, block_number);
ALTER TABLE confirmed_chain_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON confirmed_chain_events TO anon, authenticated;
GRANT ALL ON confirmed_chain_events TO service_role;
CREATE POLICY public_confirmed_evidence ON confirmed_chain_events FOR SELECT
    USING (confirmation_state = 'confirmed');
COMMIT;
