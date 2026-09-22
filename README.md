# Enterprise IAM and Digital Asset Platform

This monorepo contains the architectural foundation for an Indian DPI-aligned enterprise IAM and digital asset management platform.

## Architecture Guidelines
- **DPDP Act 2023 Compliance**: Zero Personally Identifiable Information (PII) touches the blockchain ledger or event logs.
- **Redaction Rule**: Aadhaar numbers are strictly prohibited. Mock data and test fixtures must exclusively use `[Aadhaar Redacted]`.

## Directory Structure
```
.
├── contracts/                  # Foundry environment for EVM smart contracts
│   ├── src/
│   ├── test/
│   └── foundry.toml            # Configured for Hyperledger Besu (NBFLite) and Polygon Amoy
├── backend/                    # FastAPI application
│   ├── schemas/
│   │   └── sd_jwt_credential.json # IETF SD-JWT Verifiable Credential schema
│   └── supabase/
│       └── migrations/
│           └── 001_initial_schema.sql # PostgreSQL schema with RLS and strict redactions
└── frontend/                   # React + TypeScript + Wagmi application
    ├── src/
    └── package.json
```

## Dual-DID Strategy
- **Issuer Authority (`did:web`)**: Used by the issuing government department (e.g., `did:web:gov.in:dept`). Ensures high trust linked to Web PKI (DNS) without complex on-chain registration.
- **Citizen / Holder (`did:ethr`)**: Used by individuals, backed by an ERC-1056 Identity Registry on Hyperledger Besu / Polygon Amoy. Ensures self-sovereign key control.
