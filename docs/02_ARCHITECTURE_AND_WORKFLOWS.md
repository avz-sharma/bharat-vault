# Bharat Vault: implemented architecture and workflows

Implementation date: 30 September 2026. This is a local digital-equipment demonstration. Public-testnet deployment, hardware NFC verification and signed credential issuance have not been enabled.

## Authority and identity

`DIDRegistry` deploys the pinned `ethr-did-registry` 2.0.0 ERC-1056 implementation. `IdentityAccessRegistry` supplies explicit application enrollment, active/suspended status, a single immutable organization scope, four built-in roles, bounded custom roles, expiry and revocation. RoleSBT and AccessManager have been removed from the application.

An asset's ERC-721 owner is a **stable identity address**. Every restricted operation resolves that identity's current controller. Rotation changes control, not recorded ownership. The browser derives `did:ethr:0x<chain-id>:<identity>` from the selected deployment. An ordinary wallet connection is distinguished from an API challenge proof.

| Role | Issue assets / governance | Request and accept own handovers | Approve another handover |
|---|---|---|---|
| Admin | Yes | Yes | Only with separate Manager membership |
| Manager | No | Yes | Yes |
| Auditor | No | Yes | No |
| User | No | Yes | No |

Membership keys are identity and role within the deployment's immutable organization. Two identities can have the same role independently. Custom IDs 5–32 allow subsets of request, acceptance and audit actions; they cannot grant Admin or Manager authority. Admin grants cannot expire, the last Admin cannot be revoked, and Admin membership must be removed before suspension. The demo still trusts its initial single Admin; this is not production decentralized governance.

## Asset lifecycle and handover

1. An active Admin issues a unique salted asset commitment, immutable public IPFS URI and keccak256 metadata commitment to an active identity. IDs increment independently of role types and business identifiers.
2. The current owner controller creates a request naming the recipient and deadline, at most seven days away. Replacing a pending request cancels the old request with an event.
3. When required, a separately authorized Manager approves. The request records identities, controllers, ERC-1056 change blocks, membership generations and policy versions.
4. The recipient's current controller accepts. The contract rechecks current ownership, both identities' live permissions, request state, deadline, policy versions and any Manager approval generation.
5. Completion and ownership change occur atomically. The request is consumed exactly once. The browser decodes confirmed events and retains the original account, chain, contract and submitted operation in its receipt.

Removing and regranting a Manager role does not revive the old approval. A current Manager must approve again. Participant role changes require a fresh request. ERC-1056 tracks change blocks rather than rotation counters, so request creation and approval wait until a block after an identity change; this closes a same-block rotate-away/rotate-back ambiguity.

All public `transferFrom`, both safe-transfer overloads, and approval APIs are blocked. The shared `_update` boundary accepts a single internal token/recipient permit and consumes it before receiver callbacks. Mint and handover entry points use reentrancy guards. Burning is not exposed; retiring is permanent and preserves provenance. This deliberately limits ordinary ERC-721 marketplace interoperability.

## Backend and read model

The backend has no Admin key and cannot move assets. A configured RPC adapter checks chain ID and the runtime-code hashes of the three manifest contracts. Challenges bind the audience, DID, current controller, registry, random nonce and expiry. Nonces and opaque session-token hashes are durable. EOA signatures and ERC-1271 contract-controller signatures are supported by the adapter. Protected session checks resolve the current controller and active status again. User UUIDs are server-generated after proof; browser-provided profile data cannot assign identity authority.

`Store` uses SQLAlchemy with SQLite WAL for the local demo and a PostgreSQL/psycopg adapter. Real PostgreSQL multi-process integration still requires deployment-environment validation; SQLite tests do not prove PostgreSQL concurrency behavior. Use a distinct database per deployment. The indexer's manifest fingerprint prevents accidentally mixing two chains, address sets or confirmation policies.

`Indexer` ingests only configured contract logs after a configured number of inclusion confirmations, starting at the actual deployment block. Event identity includes transaction hash and log index; the database is additionally scoped to one manifest. Blocks retain canonical hashes and parents. Each block and checkpoint commits atomically. Retries are idempotent, out-of-order blocks and removed/mismatched logs are refused, and a changed canonical tip triggers rollback and ownership rebuilding from retained events. Public inventory/history responses carry checkpoint evidence and refuse an observed unreconciled reorganization. Authorization always remains on-chain.

Run the indexer worker continuously with `--watch` for new receipts to appear in inventory. Pending local transactions are shown separately from the confirmed projection. Reverted transactions do not retain application events. No claim is made that SQL records constitute an immutable ledger.

## Physical evidence boundary

The protocol module now implements the selected encrypted-PICC profile: C7 header, seven-byte UID, three-byte little-endian counter, separate meta/file keys, CMAC session derivation, configured NDEF MAC bytes and interleaved MAC truncation. Tests use independent examples from [NXP AN12196 revision 2.0](https://www.nxp.com/docs/en/application-note/AN12196.pdf), including nonempty MAC input. This validates those vectors, not a physical tag.

Prototype storage rejects UID, token and commitment reuse, preserves a monotonic counter, distinguishes pending/confirmed bindings, and commits counter advancement and a verification result together. Concurrent attempts yield one winner. Retrying the same unexpired authenticated-operation context returns its prior result; changing that context does not.

The contract's optional physical-binding path verifies EIP-712 evidence for one request, token, sender, recipient, binding version, nonce, digest and short validity window. The EIP-712 domain binds chain and contract. Verifier authorization and nonce consumption are checked at acceptance, with no authorized verifier seeded by deployment. Contract-wallet verifier signatures use ERC-1271.

There is **no production tag provisioning, mock-tap or attestation-signing endpoint**. Physical verification returns HTTP 503 with explicit unavailable checks and `eligible=false`. Setting `VAULT_PHYSICAL_ENABLED=true` refuses startup. Enabling real NFC later needs independent hardware/provisioning validation, protected per-tag key management and an authenticated chain-bound signing service. Never point a simulator signer at a real asset deployment.

Even a valid tag response does not prove proximity, prevent relay, prove attachment to an object, or establish legal title. The oracle signing key and provisioning process remain trusted.

## Credentials and private storage

Unsigned sample credentials, government issuer examples and zero-knowledge/compliance slogans were removed. The credential panel reports unavailable. No raw credentials are issued, uploaded or decrypted by the running API.

Migration 002 quarantines legacy credential access, adds server-owned verified auth-UUID/DID links, requires unrevoked/unexpired holder links for client reads, and denies direct reads of both legacy plaintext and ciphertext columns. RLS tests run inside actual embedded PostgreSQL under owner, other-user, anonymous, Auditor and service-role sessions. API opaque sessions are not Supabase JWTs: a future hosted credential service must establish Supabase subjects through its trusted authentication integration and recheck the current controller before decrypting. That service remains disabled.

A production credential release additionally requires a pinned SD-JWT implementation/profile, a real team-controlled issuer, encrypted payloads and key management, nonce/audience-bound holder presentations, independent verification, status/revocation and exercised retention/deletion. The audit plan explicitly allows exclusion instead of unsigned substitutes.

## Frontend and data minimization

My Vault is the default screen. Organization, handover, audit and identity sections are split into feature modules and loaded on demand. Writes require a supported network, generated manifest, matching bytecode and wallet context; calls are simulated before wallet submission. Integer parsing preserves uint256 IDs and rejects fractions, scientific notation and zero recipients.

Asset inventory comes from the event projection; details and permissions come from direct chain reads. No fallback sample gallery is merged into real results. Metadata verification hashes a user-selected JSON file locally with a 64 KiB bound; there is no arbitrary-URL backend fetch, HTML rendering or SSRF-capable metadata proxy. Neither raw serials nor credential claims are part of the predefined calldata/events. Free-form metadata and user input still require operator review; these controls are not a legal compliance guarantee.

## Migration and recovery

These contracts require a new deployment and manifest. There is no in-place upgrade path and no automatic migration of existing assets. Preserve old chain evidence and agree an explicit opt-in migration if any real deployment exists. On index corruption, stop the worker, preserve the database, create a new deployment-scoped database and replay canonical logs. Do not reset live tag counters or erase provisioning history to recover replay state.
