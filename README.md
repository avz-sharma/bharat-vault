# Bharat Vault

A local demonstration of identity-aware equipment ownership and verified digital handover, using React/Vite/Wagmi, FastAPI, a durable event projection and Solidity contracts.

The implemented path is: enroll a stable identity, grant a role, issue an asset as Admin, request transfer as owner, approve as Manager when required, accept as recipient, and inspect chain evidence. Revocation, controller rotation and direct ERC-721 bypasses are enforced by the contracts.

## Start here

- [Architecture and trust boundaries](docs/02_ARCHITECTURE_AND_WORKFLOWS.md)
- [Verified setup and demo commands](docs/03_SETUP_AND_DEMO_GUIDE.md)
- [Changes, validation and remaining release gates](docs/04_CHANGELOG_AND_VALIDATION.md)
- [Plain-language app walkthrough](docs/05_APP_WALKTHROUGH.md)
- [Fresh-user manual test plan](docs/06_FRESH_USER_MANUAL_TEST_PLAN.md)

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.lock
npm run build
npm run test
.venv\Scripts\python.exe -m pytest backend/tests -q
node scripts/test-rls.mjs
```

Start `npm run chain`, then `npm run deploy:local` and `npm run demo:test`. In separate terminals run the backend indexer with `--watch`, the FastAPI server and `npm run dev`, as shown in the setup guide. The interface is at `http://127.0.0.1:3000`.

## Release boundaries

Physical NFC authenticity, signed SD-JWT credentials, passkeys and public-testnet deployment are not enabled. NFC protocol vectors and durable replay storage are tested independently; physical verification refuses eligibility until its hardware/service gates are completed. Existing contracts require a new deployment and an explicit migration plan if they hold real assets.

The project does not claim legal-title transfer, government issuance, zero-knowledge verification, or automatic regulatory compliance. Keep personal records, tag keys and raw serials out of public metadata and calldata. Generated manifests identify one authoritative deployment; switching chains is not a bridge.
