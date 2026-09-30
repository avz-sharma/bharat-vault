# Bharat Vault: changelog and validation

Date: 30 September 2026. This record distinguishes completed local implementation from the full production release gates in the original audit. Initial validation used a downloaded source folder. For publication, its Git metadata was initialized from the existing `main` history of `https://github.com/avz-sharma/bharat-vault`, preserving current source files. No public blockchain deployment is claimed.

## Implemented changes

| Audit findings | Before | Implemented behavior and migration |
|---|---|---|
| F01–F04, F16 | Disconnected badge/AccessManager state, globally unique role-token IDs and Auditor minting | Removed badge authority. A single identity registry supplies scoped, expiring, independently revocable memberships. Only Admin can mint. Dependencies and compiler are pinned. Requires new contracts and manifest. |
| F05, F10 | Inherited transfer bypasses and formatted-only identities | Pinned ERC-1056 controller resolution, explicit enrollment/status, stable owner identity, request/approval/acceptance, generation and controller-history rechecks, blocked standard transfers, callback guards and current-controller API proofs. |
| F06–F08, F15 | Shared demo secrets, mock evidence API, incorrect NFC math and process-local replay state | Removed mock/provisioning API and secret fallbacks. Physical service is disabled. Replaced protocol math with independent vector-checked code; prototype durable bindings/counters reject rebinding, restart replay and concurrent reuse. Production NFC is not claimed. |
| F09, F17, F19 | Unsigned credentials, unused passkey helpers and unsupported security/compliance claims | Removed sample credentials and passkey helpers. Credential/physical features report unavailable. Public metadata commitments and bounded local file validation replace trusted sample content. |
| F11–F14 | Fixed IDs 1–4, placeholder addresses, broken UUID/DID RLS and mutable audit-list claims | Generated ABIs/manifests with bytecode gates; paginated, deployment-scoped event projection and chain-linked history; atomic checkpoints/reorg rollback; server-owned verified identity links; restrictive credential migration with PostgreSQL RLS tests. |
| F18 | Wrong CI directories and missing analyzer reports treated as success | Contract CI runs in `contracts`; test discovery is checked; failed/malformed/missing analyzer reports and High/Medium findings fail; frontend, backend, database and local acceptance jobs added. Hosted CI not executed here. |
| F20–F21 | Large mixed UI, ornamental global overrides, fractional roles and mutable success messages | Feature components, semantic light/dark tokens, lazy sections, My Vault default, real empty/error/pending states, strict integer/address validation and immutable operation receipts decoded from confirmed events. |

Backend modules are separated into RPC reads, authentication, durable storage, indexing, HTTP routes and NFC parsing. The application does not hold user/controller keys. Generated ABIs are checked into source; local manifests, databases and receipt artifacts are regenerable and ignored.

The handoff includes a plain-language app walkthrough (`05_APP_WALKTHROUGH.md`) and a fresh-user manual test plan (`06_FRESH_USER_MANUAL_TEST_PLAN.md`). They explain actual screen labels, role boundaries, local wallet setup, expected successes/rejections and evidence collection. The manual plan is a procedure for a new tester, not a claim that its new cases have already been executed. Ignore rules also cover additional local databases, wallet/secret files, Python environments, coverage, browser reports and agent-local configuration while retaining example configuration and source lockfiles.

## Validation evidence

All tests use synthetic identities and equipment. Main commands are in the setup guide.

| Check | Observed result |
|---|---|
| Clean dependency install | Removed/reinstalled npm workspace dependencies using the root lockfile (`npm ci`); production build and all suites passed afterward. The recorded Python environment uses the pinned backend lockfile. |
| Foundry contract regressions | 21 tests passed across three suites: 18 regressions, two contract-controller/ERC-1271 tests and one stateful invariant. Includes 256 unauthorized-mint fuzz runs, wrong-contract proof rejection and nonce reuse against a new request. |
| Stateful invariant | 128 runs × 32 calls = 4,096 calls; no unexpected reverts. Exercises valid handovers, membership revoke/regrant and bypass attempts; ownership/balance/issuance/request invariants hold. |
| Frontend TypeScript/Vite | Production build passed; 17 validation/deployment-gate tests passed. |
| Backend pytest | 26 tests passed: durable replay, concurrent workers, NXP vectors, authentication, exact-origin CORS, index retries/reorgs and analyzer-gate regressions. |
| Ruff | Backend and Python tooling passed. |
| PostgreSQL RLS | 13 checks passed in PGlite 0.5.8's real PostgreSQL engine: owner, other holder, anonymous, Auditor, service, forgery, payload isolation, expiry and revocation. This does not emulate the hosted Supabase auth service. |
| Slither 0.11.3 | 32 contracts analyzed with 100 detectors. Gate passes with zero High/Medium findings; seven Low timestamp findings remain. An implicit-zero local evidence value reported as Medium was explicitly initialized and the analyzer rerun. |
| Local chain acceptance | 28 confirmed application transactions; three non-Admin mint denials, successful consent transfers, replay denial, revoked/regranted Manager approval denial and controller rotation demonstrated. JSON receipts saved under `validation`. |
| Index/API integration | Live HTTP/RPC test passed for EOA and ERC-1271 logins, challenge reuse, wrong chain and stale-session rejection after rotation. Two distinct wallet inventories include token IDs beyond 4 and match direct `ownerOf` reads. Confirmed checkpoint, contract, transaction and block evidence returned. |
| Browser | Desktop and 390×844 mobile viewport checked. No page-wide horizontal overflow (375 CSS-pixel content viewport measured). Light/dark layouts, accessible form labels, unavailable credentials and disabled privileged actions without a wallet inspected. |

The injected-wallet transaction prompts were not driven in the browser; the end-to-end transaction scenario uses local Anvil accounts. The standard inherited safe-transfer implementation produces an unreachable-code compiler warning because direct transfers deliberately revert. This is expected. The Python tests emit an upstream Starlette/AnyIO deprecation warning. Foundry's lightweight invariant test interface may report missing optional target-list accessors; the invariant is discovered and executes all 4,096 handler calls.

## Measured performance

Environment: Windows 11 build 26200, AMD64 Family 25 Model 117 Stepping 2 CPU, Python 3.13.9, Node 26.4.0, loopback RPC/API, six synthetic assets, SQLite WAL, concurrency 1. `scripts/benchmark.py` records details in `validation/benchmark.json`.

- NFC cryptography only: 200 samples; p50 approximately 0.017 ms, p95 approximately 0.025 ms. This excludes a hardware tap, database, signing and chain transaction.
- Inventory HTTP request including canonical-block RPC: 50 samples; p50 approximately 27.1 ms, p95 approximately 40.4 ms.
- Production main JavaScript: approximately 554 kB minified / 165 kB gzip. All JavaScript chunks combined: approximately 173 kB gzip. A 200,000-byte gzip regression budget is enforced by `scripts/check-bundle.mjs` and CI.
- Importing the injected connector from Wagmi's core export reduced modules transformed from 4,663 to 1,568. Builds measured 37.4 s and 6.1 s in different cache conditions; these are observations, not a controlled speedup claim.

Vite still reports its advisory for the main chunk exceeding 500 kB minified. Wallet interaction latency, chain finality, production throughput, Lighthouse/Core Web Vitals and a large-dataset database benchmark were not measured. No original-app rendering benchmark exists for comparison.

## Remaining release gates

1. **Public network:** no supplied testnet deployment, RPC credentials, funded key or existing-asset inventory was available. Deploy a new reviewed manifest explicitly and validate the selected network's Cancun support and confirmation policy. Besu was not run here.
2. **Physical hardware:** no independently provisioned NTAG tag was supplied. Published vectors pass, but real-tag interoperability, attachment/proximity limitations, protected provisioning, key rotation and the authenticated attestation-signing service remain required. Physical eligibility is disabled.
3. **Credentials:** the plan's explicit deferral option was applied. Real SD-JWT issuance/presentation/status, controlled issuer hosting, encryption/decryption and retention execution remain unimplemented and unavailable. No unsigned substitute is presented.
4. **Hosted authentication/data:** opaque API sessions and PostgreSQL RLS have separate tested boundaries. Supabase JWT subject provisioning and a live PostgreSQL multi-process deployment must be integrated and tested before enabling private credential records.
5. **Operational maturity:** independent security review, multi-signer/delayed governance, incident/key recovery, abuse controls/rate limits, production monitoring and deployment-specific performance/accessibility testing remain necessary before real assets or sensitive records.

This is the plan's working digital core plus security hardening and gated physical protocol work, not a claim that every multi-day production phase has been completed.

## Recovery and rollback

No real asset was migrated, burned or reissued. New contracts are non-upgradeable. Keep old manifests/receipts as provenance and choose an explicit migration for any existing deployment. For a disposable local reset, stop the task's services, preserve its database, restart Anvil and regenerate the manifest/seed/index. For a read-model repair, retain chain authority and replay logs into a fresh deployment-scoped database. Never recover a real tag by deleting its counter floor.

The Markdown guides in this directory are synchronized to the requested architecture folder. Build products, databases, screenshots, dependency files, private keys and test artifacts do not belong in that folder.
