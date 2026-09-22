-- Migration: 001_initial_schema
-- Description: Core tables for IAM and digital asset management adhering to DPDP Act 2023.
-- Note: Real Aadhaar numbers must never be stored. All references must use '[Aadhaar Redacted]'.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Table: credentials
-- ==========================================
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    holder_did VARCHAR(255) NOT NULL, -- e.g., did:ethr
    issuer_did VARCHAR(255) NOT NULL, -- e.g., did:web
    sd_jwt_payload TEXT NOT NULL, -- The raw SD-JWT string (contains no PII, Aadhaar is '[Aadhaar Redacted]')
    status_list_index INTEGER, -- For on-chain revocation mapping
    is_revoked BOOLEAN DEFAULT FALSE,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast DID lookups
CREATE INDEX idx_credentials_holder_did ON credentials(holder_did);

-- Enable Row Level Security (RLS) on credentials
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Holders can only read their own credentials.
-- Assuming the authenticated user's JWT contains their DID in the 'sub' claim.
CREATE POLICY "Holders can view their own credentials"
    ON credentials
    FOR SELECT
    USING (auth.uid()::text = holder_did);

-- ==========================================
-- Table: audit_events
-- ==========================================
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_hash VARCHAR(66) NOT NULL, -- Mirrored EVM tx hash
    caller_did VARCHAR(255) NOT NULL, -- DID that initiated the event
    event_type VARCHAR(100) NOT NULL,
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    aadhaar_redacted_field VARCHAR(255) DEFAULT '[Aadhaar Redacted]' -- Explicit confirmation of redaction policy
);

-- Index for fast tx hash and DID lookups
CREATE INDEX idx_audit_events_tx_hash ON audit_events(transaction_hash);
CREATE INDEX idx_audit_events_caller_did ON audit_events(caller_did);

-- Enable Row Level Security (RLS) on audit_events
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view audit events associated with their DID.
CREATE POLICY "Users can view their related audit events"
    ON audit_events
    FOR SELECT
    USING (auth.uid()::text = caller_did);
