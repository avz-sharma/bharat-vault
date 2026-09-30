# Bharat Vault: setup and demo guide

Verified on Windows 11, Node 26.4.0 and Python 3.13.9. Run commands from the repository root. npm uses one root workspace lockfile. Foundry 1.7.1, Solidity 0.8.26, OpenZeppelin 5.4.0 and ERC-1056 registry 2.0.0 are pinned. The EVM must support Cancun. Besu is a separately configured deployment, not an automatic fallback or bridge.

## Install and validate

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.lock
npm run build
npm run test
.venv\Scripts\python.exe -m pytest backend/tests -q
.venv\Scripts\ruff.exe check backend
node scripts/test-rls.mjs
```

On Linux/macOS use `.venv/bin/python` and `.venv/bin/ruff`. Pinned native Foundry binaries are supplied for Windows x64, Linux x64 and macOS ARM64. The Solidity compiler is downloaded by Foundry on the first build. The agent's Windows sandbox denied Foundry home-directory and esbuild path access; the same commands succeeded outside that sandbox. Do not disable analyzer failures or change source to hide a tool failure.

## Start the local demonstration

In terminal 1:

```powershell
npm run chain
```

In terminal 2:

```powershell
npm run deploy:local
npm run demo:test
.venv\Scripts\python.exe -m backend.indexer --watch
```

In terminal 3:

```powershell
.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

In terminal 4:

```powershell
npm run dev
```

Open `http://127.0.0.1:3000`. Use this exact origin with the default backend audience/CORS setting. Backend health is `http://127.0.0.1:8000/api/v1/health`. Vite and Anvil listen on loopback. The application reads actual deployment manifests from `frontend/public/deployments/<chainId>.json`; `npm run deploy:local` generates them from successful deployment receipts and bytecode. `npm run abi` exports frontend/backend ABIs from compiled artifacts.

Anvil's funded, unlocked accounts and printed keys are public test fixtures. Never use them on a public network or for real assets. Connect an injected test wallet configured for chain 31337 and the local RPC. An injected browser wallet is still required for manual UI transactions; the automated demo signs through Anvil's loopback-only unlocked accounts.

| Anvil account | Synthetic demo role |
|---|---|
| 0 | Admin |
| 1 | Manager |
| 2 | Auditor |
| 3 | User A |
| 4 | User B |
| 5 | Temporary controller for rotation test |

The seed script enrolls two Users with the same role, proves three non-Admin mint denials, issues a Manager-controlled instrument, performs a consent-based handover, rejects a replay, rejects acceptance after Manager revocation and after regrant without renewed approval, restores approval, tests controller rotation, and creates additional inventory past ID 4. Receipts go to `validation/demo-receipts.json`; the sample public metadata bytes go to `validation/demo-metadata.json`. The fixture URI is deliberately synthetic and not advertised as an uploaded IPFS object. Use the local file-integrity checker for this fixture.

With the seeded chain, indexer and API running, run `npm run integration:test`. This exercises real HTTP/RPC wallet and ERC-1271 authentication, nonce reuse, wrong-chain and stale-session rejection, and compares both indexed inventories to `ownerOf`. It temporarily rotates the synthetic User A controller and restores it after the checks. Use only the disposable local demonstration deployment.

## Manual workflow

1. Open Identity & Credentials, select the stable identity and enroll if new. The connected wallet must be its current controller.
2. Connect as Admin. In Organization grant a User role to each enrolled holder. Grant Manager separately; Admin does not imply Manager approval authority.
3. Mint to User A using a unique salted commitment, public IPFS URI and metadata file hash. Select whether Manager approval is required.
4. Connect as A, inspect the token under My Vault and request handover to B. The confirmed receipt includes the request ID.
5. Connect as Manager and approve that request under Handover. Connect as B, inspect the checks and accept.
6. Inspect both inventories and the Audit tab after the indexer catches up. Repeat acceptance to see rejection. Use Admin to revoke a Manager between approval and acceptance to demonstrate live policy enforcement.
7. Controller rotation changes the signer for the same identity. Set the stable identity address in the identity screen, wait a block after rotation, and create new requests as required.

The browser never falls back to another network or a sample asset list. Unsupported networks, missing manifests, mismatched bytecode and unavailable read models block or label the affected operations.

## Configuration and deployment boundaries

`.env.example` documents backend variables. The backend does not automatically load `.env`; export variables in the shell or your process manager. Vite reads `frontend/.env`. No `VITE_*` value may contain a private key, NFC key, service token or database credential.

For PostgreSQL set `VAULT_DATABASE_URL` to a `postgresql+psycopg://...` URL and provision database credentials privately. Set `VAULT_MODE=production` to disallow SQLite. Test the real deployment's concurrent workers and authentication boundary before releasing. Supabase credential tables require migrations 001 then 002 and a separate trusted auth integration; the running demo does not expose them as an enabled credential service.

Keep `VAULT_PHYSICAL_ENABLED=false`. A hardware release needs independently tested tags, provisioning, keys and a scoped attestation signer; turning a flag on does not bypass that gate. Signed credentials and passkeys also remain excluded.

No public testnet was deployed during implementation. For an explicitly authorized new testnet deployment, supply a non-demo `PRIVATE_KEY` privately, set `VAULT_RPC_URL`, and run `node scripts/deploy.mjs` without `--local`. Configure the matching frontend RPC and publish only its generated public manifest. Review chain support, confirmations, governance and gas funding first. Do not transfer existing real assets as part of setup.

## Rebuilds and troubleshooting

- A new chain/deployment needs a new manifest and a separate database. Stop local processes and preserve the prior local database before resetting. A deployment-fingerprint mismatch intentionally refuses startup in the indexer.
- An empty or lagging vault requires a running/caught-up indexer. Asset lookup can inspect authoritative chain state while the index is unavailable.
- An API challenge audience error usually means `localhost` and `127.0.0.1` differ. Set `VAULT_AUDIENCE` to the exact browser origin and restart the API.
- Restored permission does not revive stale approvals. Approve again or create a fresh request according to the changed generation/policy.
- Never run Slither's clean build concurrently with Foundry builds/tests. Run it from `contracts`, where relative imports resolve.

## Static analysis

```powershell
.venv\Scripts\python.exe -m pip install slither-analyzer==0.11.3
# Add the repository's native Foundry bin directory to PATH, then:
cd contracts
..\.venv\Scripts\slither.exe . --filter-paths 'node_modules|test' --exclude-dependencies --fail-high --json slither-report.json
..\.venv\Scripts\python.exe ../scripts/check-slither.py slither-report.json
```

The gate rejects missing/invalid/failed reports and all High/Medium findings. Low timestamp findings are expected for explicit expiry semantics and remain visible. CI executes contract discovery/tests, static analysis, Python checks, frontend build/tests, PostgreSQL RLS checks and the local chain acceptance script. Hosted CI itself has not been run from this source-only checkout.
