# Bharat Vault: a plain-language app walkthrough

Version: current local demonstration, 30 September 2026. Audience: first-time users, reviewers and people presenting the app. Allow about 10 minutes after setup. For installation, use [the setup guide](03_SETUP_AND_DEMO_GUIDE.md); for hands-on checks, use [the manual test plan](06_FRESH_USER_MANUAL_TEST_PLAN.md).

## What does the app do?

Bharat Vault records who holds an equipment item and controls how its digital record changes hands. Think of a laboratory lending a microscope: the organization creates its record, the current holder requests a handover, a Manager approves when required, and the recipient accepts. Each completed action has a transaction receipt.

The current demo runs on a local test blockchain. Its equipment and accounts are synthetic. Physical NFC verification and signed credentials show **Not enabled**; this version demonstrates digital ownership and permission checks. A digital record alone does not establish legal title or prove that the actual equipment is genuine.

## Words you will see

| Term | Everyday meaning | Example in the app |
|---|---|---|
| Wallet | A signing tool that lets you approve actions as a particular account. | Click **Connect wallet**, then review the wallet's prompt. |
| Address | The account's identifier, starting with `0x`. | The recipient identity entered for a handover. |
| Identity / DID | A persistent identity label; DID means decentralized identifier. | An identity has a chain-aware label beginning `did:ethr:`. |
| Controller | The account currently allowed to act for an identity. | Changing the controller changes the signer while equipment remains with the same identity. |
| Role | A named set of permissions. | Admin, Manager, Auditor or User. |
| Enrollment | Registering an identity with this organization. | **Enroll identity** creates a confirmed registration. |
| Asset / token ID | An equipment record and its unique number. | Asset `#7`; it is separate from its holder's address. |
| Mint | Create a new asset record and allocate it to its first holder. | **Mint & allocate**, available to Admin. |
| Blockchain | The transaction record used as the authority for ownership and permissions. | The app reads the selected deployment's contracts. |
| Smart contract | Rules enforced by code on that blockchain. | Acceptance fails if the approving Manager has lost permission. |
| Transaction / receipt | An attempted change and the evidence of its confirmed result. | A hash identifies the transaction; a block number identifies where it was recorded. |
| Hash / commitment | A fingerprint of data, used to check whether exact bytes have changed. | A selected metadata file must match its recorded fingerprint. A hash is not encryption. |
| Metadata / IPFS URI | Public descriptive data and the location supplied for it. | A public equipment name; the app does not automatically upload or fetch the file. |
| Indexer / checkpoint | A worker that reads chain events into a searchable view, and the block it has reached. | Inventory may catch up shortly after a confirmed transfer. |
| Revocation / expiry | Removing a permission, or reaching its end time. | An old approval can no longer authorize acceptance after Manager revocation. |

## Who can do what?

| Role | Main responsibility | Important boundary |
|---|---|---|
| Admin | Manage memberships, issue assets and change lifecycle policy. | Admin also needs a separate Manager role to approve a Manager-controlled handover. |
| Manager | Approve handovers that require approval. | Cannot issue assets merely by being Manager. |
| Auditor | Inspect public evidence and activity. | Cannot issue assets merely by being Auditor. The public Audit view is also readable by other connected users. |
| User | Hold equipment, request handover of their own asset and accept an asset addressed to them. | Cannot give themselves organization privileges. |

All four built-in roles can request and accept handovers for their own eligible assets. Enrollment alone does not grant a role. Two people can hold the same role, and removing one person's membership does not remove the other's.

## Read the top bar first

Open `http://127.0.0.1:3000`. The default section is **My Vault**. Before connecting, the top bar says **Wallet disconnected**. Connect a test wallet on local chain **31337**. Continue when the bar reports **deployment verified**: the app has checked the configured contracts against the deployment manifest, which is the list of addresses and expected code fingerprints.

An unsupported network or unavailable deployment blocks protected actions. A connected wallet proves that a wallet is present; **Prove API session** separately asks it to sign a short-lived sign-in challenge for the backend.

## The five sections

| Section | What to do there | What to look for |
|---|---|---|
| **My Vault** | Inspect your indexed inventory or look up a token ID. Request a handover for an asset you control. | Current owner, lifecycle, Manager requirement, pending request and metadata integrity. |
| **Handover** | Enter a request ID, inspect its checks, then approve as Manager or accept as recipient. | Sender, recipient, request state, current permissions and expiry. |
| **Organization** | As Admin, grant/revoke roles and use **Issue an asset**. Advanced panels manage identity status, custom roles and lifecycle. | Disabled controls when your identity lacks Admin permission. |
| **Audit** | Browse confirmed enrollment, role, issuance and handover events. | Transaction hash, block number, log position and event details. Its filter applies to the current page. |
| **Identity & Credentials** | Enroll, prove an API session, choose a stable identity or change its controller. | Active enrollment and current controller. The credential panel is explicitly unavailable. |

Leave **Stable identity address** empty during normal account switching. Fill it only when using a different controller for an existing identity. If you leave another person's identity there, the app correctly reports that your wallet does not control it.

## Walk through one equipment handover

**Example:** Asha holds a synthetic microscope; Bharat will receive it. Use the seeded demo's User A and User B accounts to represent them.

1. **Admin creates the record.** In **Organization → Issue an asset**, enter User A as **Initial holder**, a unique asset commitment, the exact metadata hash and an `ipfs://` URI. Keep **Require Manager approval for handovers** checked. Select **Mint & allocate** and confirm the wallet transaction. Keep the issued token ID from the receipt.
2. **Asha requests the handover.** Connect as User A, open **My Vault**, inspect that token, enter User B as **Recipient identity** and choose a deadline, for example 24 hours. Select **Request handover**. Keep the request ID from the confirmed event details.
3. **Manager approves.** Connect as Manager. In **Handover**, enter the request ID, select **Inspect request**, check the participants and select **Approve as Manager**.
4. **Bharat accepts.** Connect as User B, inspect the same request and select **Accept handover**. The contract rechecks permission, ownership, deadline and approval at execution time. Completion consumes that request.
5. **Check the evidence.** The receipt should say **Confirmed**. Asset detail should name User B as the owner. After the indexer catches up, the item moves between the two inventories. Open **Audit** to inspect its confirmed events.

The flow is: **Admin issues → owner requests → Manager approves if required → recipient accepts → ownership changes and a receipt is recorded.** A request or Manager approval alone does not transfer ownership.

The seeded script already demonstrates this flow and additional rejection cases. For a fresh interactive example, issue a new synthetic asset rather than assuming an earlier request is still pending.

## What makes a result trustworthy?

**Awaiting wallet** means your wallet decision is needed. **Pending confirmation** means the transaction was submitted. **Confirmed** means it succeeded on the selected chain. **Failed** means the requested change did not succeed. The receipt preserves the submitted account, network and operation even if a form is later edited.

Screens are snapshots. If a role is revoked or a controller changes after a request, the final acceptance can fail even if earlier checks looked correct. Regranting a Manager role requires renewed approval; it does not revive the old approval. Participant membership, controller or asset-policy changes can require a new request.

For metadata, choose the exact JSON file under **Verify a public metadata file**. Matching bytes prove the file agrees with the recorded fingerprint; they do not establish that its descriptions are true. Files are checked locally and must be no larger than 64 KiB. Do not include personal records in public metadata.

## Common first-use questions

- **Why is my vault empty?** Your identity may hold no assets, the wrong identity may be selected, or the indexer may be behind. Use direct token lookup and inspect the checkpoint.
- **Why can't I mint?** Only an active Admin controller may issue assets. Changing tabs does not grant permission.
- **Why can't I accept?** You must control the named recipient identity, and all current checks must pass. A completed, cancelled or expired request cannot be reused.
- **What does an API session prove?** That the current controller signed a challenge for this app at sign-in. Protected backend checks revalidate identity state; this is not an identity-document or government check.
- **Why isn't a failed action in Audit?** Audit lists successful on-chain events. Rejected simulations and reverted calls do not create those application events.
- **Can I scan a tag or receive a credential?** Those services are gated in this version. Their unavailable state is the expected behavior.

For a short presentation, show the owner before and after acceptance, an Auditor's disabled issuance controls, a Manager revocation that prevents acceptance, and the transaction evidence. Those observations explain the product more clearly than a list of technologies.
