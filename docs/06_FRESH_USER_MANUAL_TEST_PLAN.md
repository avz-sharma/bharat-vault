# Bharat Vault: fresh-user manual test plan

Version: 30 September 2026. Audience: a tester who has never used the app. Estimated time: 45–60 minutes for core cases after installation; allow additional time for optional cases. This is a repeatable test procedure. It does not claim that a new tester has executed or passed these manual cases.

Read [the plain-language walkthrough](05_APP_WALKTHROUGH.md) first. Keep [the setup guide](03_SETUP_AND_DEMO_GUIDE.md) available for configuration and troubleshooting. Use only synthetic data on the local demonstration chain.

## 1. Prepare a fresh environment

You need the project source, Node 26.4.0, Python 3.13.9, internet for the initial dependencies/compiler, and a browser with an injected EVM wallet. Use a separate test-wallet profile. Anvil prints funded test accounts and their public fixture private keys: import only these local test accounts, never your personal wallet or real funds.

For a genuinely fresh test, use a separate project folder with no running local chain or prior `vault-local.db`. If a demonstration is already running, ask its operator to stop it and preserve its database before reinitializing; do not redeploy into a running shared test session. Ports 8545, 8000 and 3000 must be available.

Open PowerShell in the project root and install/build:

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.lock
npm run build
```

Keep four PowerShell terminals open in that same root:

| Terminal | Commands | Purpose |
|---|---|---|
| 1 | `npm run chain` | Runs the local blockchain and prints test accounts. |
| 2 | `npm run deploy:local`, then `npm run demo:test`, then `.venv\Scripts\python.exe -m backend.indexer --watch` | Deploys, seeds the demonstration and continually updates inventory/history. |
| 3 | `.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000` | Runs the app's backend. |
| 4 | `npm run dev` | Runs the browser interface. |

Terminal 2's commands run in sequence; the last command stays running. Open `http://127.0.0.1:8000/api/v1/health`: expect `chain_id: 31337`, contract addresses and a non-null `indexed_block` once indexing catches up. Open the app at **`http://127.0.0.1:3000`**, using this exact host rather than `localhost` with the default sign-in configuration.

Add a network to your test wallet:

| Setting | Value |
|---|---|
| Network name | Bharat Vault Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` (local test balance) |
| Block explorer | Leave blank; none is configured for this local chain. |

Import the relevant Anvil fixture accounts and label them. Copy their **addresses**, not keys, into your test notes.

| Account number printed by Anvil | Test label | Role after seed |
|---|---|---|
| 0 | Admin | Admin |
| 1 | Manager | Manager |
| 2 | Auditor | Auditor |
| 3 | User A | User |
| 4 | User B | User |
| 5 | Rotation account | No seeded application role; optional controller test. |
| 6 | New user | Not enrolled; enrollment test. |

Before each account-specific case, select that account in the wallet, connect/reconnect if needed, and wait for the app's account and identity reads to update. In **Identity & Credentials**, leave **Stable identity address** empty except during the controller-rotation case. Never assume an old tab selection also changed the wallet account.

## 2. Prepare one new test asset

In a spare terminal, run this command once. It creates a small public JSON file and prints the values to paste into the issuance form. Run it again only when deliberately creating a different asset: the commitment changes each time.

```powershell
node -e "const fs = require('node:fs'); const { randomUUID } = require('node:crypto'); const { keccak256, stringToHex } = require('viem'); fs.mkdirSync('validation', { recursive: true }); const body = JSON.stringify({ name: 'Manual test microscope', description: 'Synthetic equipment for local testing only.' }); fs.writeFileSync('validation/manual-metadata.json', body); console.log('Unique asset commitment:', keccak256(stringToHex('manual-test:' + randomUUID()))); console.log('Metadata keccak256:', keccak256(stringToHex(body))); console.log('Public metadata URI: ipfs://manual-test-metadata');"
```

The URI is a synthetic fixture accepted for this local test, not a published IPFS file. The app checks the selected local file; it does not upload it. Record the two printed hashes, User A/B addresses, issued token ID and request IDs. Changing even whitespace in the file changes its hash.

## 3. Core manual cases

For each case record **Pass**, **Fail** or **Blocked**, plus the actual result. A correctly rejected action is a pass in a negative test. Allow roughly 5–15 seconds for polling and indexing; if stale, reload and compare direct token details with the indexed checkpoint. Never report an old inventory as a newly confirmed result.

### M01 — First launch and connection

1. Open the app without connecting a wallet. Confirm **My Vault** is the default and the bar says **Wallet disconnected**.
2. Select all five sections. Check that privileged buttons are disabled and no sample equipment appears as your owned inventory.
3. Connect User A on chain 31337. Wait for **deployment verified**.

**Expected:** The connected address is correct, the environment identifies a local demonstration, and asset/identity reads load. Connection alone does not display an API sign-in proof.

### M02 — Enrollment and shared memberships

1. Connect **New user** (account 6). Open **Identity & Credentials** and select **Enroll identity**. Approve the wallet transaction.
2. Confirm **Active** enrollment and that the current controller matches this account. Save the receipt hash.
3. Connect Admin. In **Organization**, set **Target identity** to New user, select **User**, set **Membership duration (days)** to `30` and select **Grant role**.
4. Reconnect New user; inspect its active identity. Connect User A and User B in turn to confirm both still load normally.

**Expected:** Enrollment and role grant have separate confirmed receipts. Granting User to the new identity does not replace either seeded User membership. A new member without issued equipment may correctly have an empty vault.

### M03 — Permission boundaries

1. As Auditor, open **Organization**. Repeat as Manager and User A.
2. Confirm **Mint & allocate**, **Grant role** and organization-policy controls are disabled, with an Admin requirement notice.
3. Connect Admin and confirm issuance/member controls become available.

**Expected:** Only Admin can operate these controls. Manager approval remains a separate permission. This case checks the UI boundary; direct-call enforcement is covered by `npm run contracts:test` and the seeded acceptance scenario.

### M04 — Admin issues an asset

1. Connect Admin. Open **Organization → Issue an asset**.
2. Enter User A's address as **Initial holder**; paste the unique commitment, metadata hash and URI prepared above.
3. Keep **Require Manager approval for handovers** checked. Select **Mint & allocate** and approve.
4. Expand the receipt's **View proof** details and save the token ID from the issuance event, transaction hash and block number.
5. Connect User A. In **My Vault**, find the item or enter its ID under **Look up a token ID** and select **Inspect asset**.

**Expected:** A confirmed issuance receipt; User A is the current identity owner, lifecycle is **Active**, and Manager approval is **Required**. The indexed inventory eventually contains the issued token.

### M05 — Duplicate issuance and input validation

1. As Admin, attempt to mint another item with the same **Unique asset commitment** from M04.
2. Attempt an initial holder of `0x0000000000000000000000000000000000000000`.
3. In My Vault's token lookup, separately try `1.5`, `-1` and `1e3`.

**Expected:** Duplicate issuance fails during contract simulation; ownership and the original asset are unchanged. Invalid addresses and non-whole IDs are rejected. No successful receipt is shown for a rejected attempt. Browser-native validation may reject an input before an app message appears.

### M06 — Metadata integrity

1. Inspect the M04 asset. Under **Verify a public metadata file**, select `validation/manual-metadata.json`.
2. Copy that file to `validation/manual-metadata-altered.json`, change its `name` value, and select the changed copy.
3. Optionally select a JSON file larger than 64 KiB.

**Expected:** The original reports **Verified: file hash matches chain commitment**; the changed file reports **Invalid: file differs from chain commitment**; an oversized file is rejected. This is an exact-file check, not a claim that the microscope exists or is authentic.

### M07 — Owner creates a request

1. Connect User A and inspect the M04 token.
2. Enter User B under **Recipient identity** and `24` under **Request expires in (hours)**. Select **Request handover** and approve.
3. Save the request ID from confirmed event details.
4. Open **Handover**, enter that request ID and select **Inspect request**.

**Expected:** Request state is **Pending**, the two identities are correct, Manager approval is missing, and User A still owns the asset. Creating a request does not transfer ownership.

### M08 — Recipient cannot skip required approval

1. Connect User B and inspect M07's request under **Handover**.
2. Select **Accept handover** before Manager approval.

**Expected:** Contract simulation rejects acceptance, usually before a wallet transaction prompt. The request remains pending and owner remains User A. Do not treat an enabled button as proof that all contract checks will pass.

### M09 — Approval and recipient acceptance

1. Connect Manager, inspect M07's request and select **Approve as Manager**. Confirm and save the receipt.
2. Connect User B, inspect the same request and select **Accept handover**. Confirm and save the receipt.
3. Inspect the asset directly, then check both User inventories and **Audit**. If inventory has not caught up, reload after indexing.

**Expected:** Request becomes **Completed**; current owner becomes User B. The item leaves A's indexed inventory and enters B's. Audit contains the request, approval, completion and ownership-change evidence.

### M10 — Completed-request replay

1. As User B, inspect M07's completed request again.
2. Check that **Accept handover** is disabled. Reload and inspect the token owner.

**Expected:** The old request cannot be accepted again and owner remains User B. This manual case checks the completed-state UI; direct replay rejection is separately tested by the automated contract/demo suites.

### M11 — Revocation invalidates an earlier approval

1. As User B, request a return of the M04 asset to User A. Save the new request ID.
2. As Manager, approve that request.
3. As Admin, in **Organization**, enter Manager's identity, select **Manager** and select **Revoke role**. Confirm.
4. As User A, attempt acceptance of the approved request.
5. As Admin, grant the same identity Manager for 30 days. As User A, try acceptance again before renewed approval.
6. As Manager, approve the pending request again. As User A, accept it.

**Expected:** Steps 4 and 5 both fail; ownership stays with User B. Regranting membership alone does not restore the old approval. Renewed Manager approval permits step 6, and ownership returns to User A. Save rejection messages and all successful hashes.

### M12 — Cancel a request

1. As User A, create another request to User B.
2. In **Handover**, inspect it and select **Cancel request** as either the sender or recipient.
3. Inspect the request as User B.

**Expected:** State is **Cancelled**, acceptance is disabled and owner remains User A.

### M13 — Receipts and public history

1. After a confirmed action, edit an unrelated form field or switch wallet accounts.
2. Inspect the existing receipt's label, original submitting account, chain ID and hash.
3. Open **Audit** and filter using a saved transaction hash. Use **Previous/Next** to find the correct page; the filter searches only that page.

**Expected:** The receipt retains the submitted operation's details. Its event evidence agrees with the recorded request/token identities. Failed simulations are absent from successful chain history.

### M14 — Features and network states

1. Open **Identity & Credentials** and check **Credentials → Not enabled**.
2. Inspect a digital asset; its physical-evidence field says no tag evidence is required.
3. In the test wallet, switch temporarily to an unsupported network, such as chain 1, then return to 31337.

**Expected:** The app does not display unsigned credentials or simulated NFC evidence as verified. Unsupported networks show a blocked state and prevent writes; returning to the valid local deployment restores readiness.

### M15 — Keyboard, mobile and theme check

1. Navigate using Tab and Enter. Check visible focus, input labels, section buttons and **Skip to content**.
2. Toggle light/dark theme; verify readable text, notices and receipts.
3. Resize to about 390 pixels wide or use the browser's responsive tools. Open each section and inspect long addresses.

**Expected:** Core controls remain reachable and readable; there is no page-wide horizontal scrolling. Record any clipped content or missing focus indication as an issue.

## 4. Optional cases after the core sequence

| ID | Steps | Expected result / recovery |
|---|---|---|
| O01: API sign-in | As active User A, select **Prove API session** and approve only its sign-in message. | Session proof, identity, server user ID and expiry appear. The message is a sign-in challenge, not an asset transfer. |
| O02: Controller rotation | While User A owns M04's asset, create a request. As A, change the controller to Rotation account in **Identity & Credentials**. Connect Rotation account, set **Stable identity address** to A and inspect ownership. Attempt acceptance of the old request as B. | Owner identity remains A; the old request fails. Use Rotation account acting for A to change the controller back to A, clear the identity field and create a fresh request. Allow a mined block after rotation; the local Anvil CLI supports a manual `evm_mine` through RPC if needed. |
| O03: Lifecycle suspension | As Admin, in **Asset lifecycle policy**, enter M04's token, choose **Suspended**, set a nonzero public reason commitment and select **Update policy**. Inspect/request handover as owner. Restore **Active** with a reason. | Suspended assets cannot be handed over. Policy changes invalidate old requests; use a fresh request after restoration. A prepared unique asset commitment can serve as a synthetic test reason. |
| O04: Permanent retirement | Only on an extra synthetic token, choose **Retired (permanent)** and update policy. | Asset stays recorded for provenance and cannot return to Active or transfer. Keep this case separate from M04; retirement is irreversible in this deployment. |
| O05: Independent membership | As Admin, revoke New user's User role; try an owned-asset request as New user if an extra item was allocated. Verify A and B can still act. | The revoked identity loses that permission; A/B retain theirs. Restore New user's membership only if needed, then use a fresh request. |
| O06: Backend outage | Stop only terminal 3 with Ctrl+C, reload My Vault, then restart the same API command. | Inventory reports an error, not sample assets. Direct on-chain token inspection can remain available. The backend outage alone does not necessarily disable valid wallet/contract actions. |
| O07: Expired request | Ask the operator to advance time on the disposable local chain beyond a saved pending request's deadline; attempt recipient acceptance. | Acceptance fails and ownership does not change. Record the chain time/deadline. This is operator-assisted; the normal form's minimum duration is one hour. |

## 5. Record results and report issues

Use this sheet for a new run; all cases start **Not run**. Keep local screenshots and notes under `validation/manual/`, which is ignored by Git. Never include wallet keys or session tokens in evidence.

| Field | Fill in |
|---|---|
| Tester / date / project commit if available | |
| OS / browser / wallet version | |
| Chain ID / asset contract / indexed block | |
| Test-case ID and status | Not run / Pass / Fail / Blocked |
| Preconditions and exact steps | |
| Expected result / actual result | |
| Token ID / request ID / transaction hash / block | |
| Screenshot or error text / recovery performed | |

Core completion requires M01–M15 to pass or have explicitly documented blockers. A case blocked by setup is not a pass. Save the issuance, request, approval, acceptance and revocation receipts; compare both owner views after transfers. O01–O07 are additional coverage, not a substitute for the core flow.

Automated checks can complement this manual run:

```powershell
npm run test
.venv\Scripts\python.exe -m pytest backend/tests -q
node scripts/test-rls.mjs
npm run integration:test
```

The integration command requires the seeded local chain, indexer and API. It temporarily rotates a synthetic controller and restores it; run it outside an in-progress manual handover. Record automated command results separately from manual case results.

After testing, disconnect the wallet. Stop the services with Ctrl+C if you no longer need the demonstration. Preserve the database and evidence before a reset; the next fresh chain needs a matching deployment and fresh deployment-scoped database.
