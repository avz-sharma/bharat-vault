import { useState } from "react";
import { Field, Form, Panel } from "./components";
import { addressValue, commitmentValue, integerValue } from "./validation";
import type { Vault } from "./useVault";

export default function Organization({ vault: v }: { vault: Vault }) {
  const [target, setTarget] = useState("");
  const [role, setRole] = useState("4");
  const [days, setDays] = useState("30");
  const [uri, setUri] = useState("");
  const [commitment, setCommitment] = useState("");
  const [metadata, setMetadata] = useState("");
  const [manager, setManager] = useState(true);
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("5");
  const [actions, setActions] = useState("3");
  const [token, setToken] = useState("");
  const [assetStatus, setAssetStatus] = useState("1");
  const admin = v.ready && v.controlsIdentity && v.identityState.data?.roles[0];
  const disabled = !admin || v.busy;
  const scope = v.identityState.data?.scope;
  const grant = () => {
    const r = Number(integerValue(role, 32n));
    const expiry =
      r === 1
        ? (1n << 64n) - 1n
        : BigInt(Math.floor(Date.now() / 1000)) +
          integerValue(days, 3650n) * 86400n;
    return v.execute(
      "identityRegistry",
      "grantRole",
      [v.identity, addressValue(target), r, scope, expiry],
      `Grant role ${r} to ${target}`,
    );
  };
  return (
    <div className="grid">
      <Panel title="Members & permissions">
        <p>
          Enroll an identity from its current controller first. Admin grants are
          permanent until explicitly revoked; other roles can expire.
        </p>
        {!admin && (
          <p className="notice">
            An active Admin controller is required for organization changes.
          </p>
        )}
        <Form onSubmit={() => v.run(grant)}>
          <Field label="Target identity">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0x…"
              required
            />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="1">Admin</option>
              <option value="2">Manager</option>
              <option value="3">Auditor</option>
              <option value="4">User</option>
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i + 5} value={i + 5}>
                  Custom {i + 5}
                </option>
              ))}
            </select>
          </Field>
          {role !== "1" && (
            <Field label="Membership duration (days)">
              <input
                type="number"
                min="1"
                max="3650"
                step="1"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                required
              />
            </Field>
          )}
          <div className="actions">
            <button disabled={disabled}>Grant role</button>
            <button
              type="button"
              className="secondary"
              disabled={disabled}
              onClick={() =>
                v.run(() =>
                  v.execute(
                    "identityRegistry",
                    "revokeRole",
                    [
                      v.identity,
                      addressValue(target),
                      Number(integerValue(role, 32n)),
                      scope,
                    ],
                    `Revoke role ${role} from ${target}`,
                  ),
                )
              }
            >
              Revoke role
            </button>
          </div>
        </Form>
        <details>
          <summary>Identity status</summary>
          <Field label="Public reason commitment">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="0x… (32 bytes)"
            />
          </Field>
          <div className="actions">
            {[1, 2].map((status) => (
              <button
                key={status}
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  v.run(() =>
                    v.execute(
                      "identityRegistry",
                      "setStatus",
                      [
                        v.identity,
                        addressValue(target),
                        status,
                        commitmentValue(reason),
                      ],
                      `${status === 1 ? "Activate" : "Suspend"} ${target}`,
                    ),
                  )
                }
              >
                {status === 1 ? "Activate" : "Suspend"}
              </button>
            ))}
          </div>
        </details>
        <details>
          <summary>Define a custom role</summary>
          <Field label="Role ID (5–32)">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} />
          </Field>
          <Field label="Allowed actions">
            <select
              value={actions}
              onChange={(e) => setActions(e.target.value)}
            >
              <option value="1">Request handover</option>
              <option value="2">Accept handover</option>
              <option value="3">Request and accept</option>
              <option value="8">
                Private audit permission (API not enabled)
              </option>
            </select>
          </Field>
          <button
            disabled={disabled}
            onClick={() =>
              v.run(() =>
                v.execute(
                  "identityRegistry",
                  "defineRole",
                  [
                    v.identity,
                    Number(integerValue(custom, 32n)),
                    Number(actions),
                  ],
                  `Define custom role ${custom}`,
                ),
              )
            }
          >
            Define role
          </button>
        </details>
      </Panel>
      <Panel title="Issue an asset">
        <p>
          Allocate equipment to an active identity. Public metadata must contain
          no personal information. Use a salted, issuer-scoped asset commitment.
        </p>
        <Form
          onSubmit={() =>
            v.run(() =>
              v.execute(
                "assetNFT",
                "mintAsset",
                [
                  v.identity,
                  addressValue(target),
                  commitmentValue(commitment),
                  commitmentValue(metadata),
                  uri,
                  manager,
                ],
                `Issue asset to ${target}`,
              ),
            )
          }
        >
          <Field label="Initial holder">
            {" "}
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0x…"
              required
            />
          </Field>
          <Field label="Unique asset commitment">
            <input
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
              placeholder="0x… (32 bytes)"
              required
            />
          </Field>
          <Field label="Metadata keccak256">
            <input
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              placeholder="0x… (32 bytes)"
              required
            />
          </Field>
          <Field label="Public metadata URI">
            <input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="ipfs://…"
              pattern="ipfs://.+"
              maxLength={200}
              required
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={manager}
              onChange={(e) => setManager(e.target.checked)}
            />
            Require Manager approval for handovers
          </label>
          <button disabled={disabled}>Mint & allocate</button>
        </Form>
        <details>
          <summary>Asset lifecycle policy</summary>
          <Field label="Token ID">
            <input value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
          <Field label="Lifecycle state">
            <select
              value={assetStatus}
              onChange={(e) => setAssetStatus(e.target.value)}
            >
              <option value="1">Active</option>
              <option value="2">Suspended</option>
              <option value="3">Retired (permanent)</option>
            </select>
          </Field>
          <p>
            Uses the Manager requirement and public reason commitment shown on
            this screen. Changes invalidate pending handovers.
          </p>
          <button
            disabled={disabled}
            onClick={() =>
              v.run(() =>
                v.execute(
                  "assetNFT",
                  "setAssetPolicy",
                  [
                    v.identity,
                    integerValue(token),
                    Number(assetStatus),
                    manager,
                    commitmentValue(reason),
                  ],
                  `Update asset ${token} policy`,
                ),
              )
            }
          >
            Update policy
          </button>
        </details>
      </Panel>
    </div>
  );
}
