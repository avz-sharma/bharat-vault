import { useEffect, useState } from "react";
import { Field, Panel, Proof } from "./components";
import { api, type Vault } from "./useVault";
import { addressValue, didValue } from "./validation";

export default function Identity({ vault: v }: { vault: Vault }) {
  const [newController, setNewController] = useState("");
  const [session, setSession] = useState<{
    identity: string;
    user_id: string;
    expires: number;
  }>();
  useEffect(() => {
    setSession(undefined);
  }, [v.account.address, v.account.chainId, v.identity]);
  async function authenticate() {
    if (!v.identity || !v.wallet || !v.account.chainId || !v.controlsIdentity)
      throw new Error("Connect the current identity controller.");
    const chainId = v.account.chainId;
    const identity = v.identity;
    const challenge = await api<{ id: string; message: string }>(
      "/auth/challenge",
      { method: "POST", body: JSON.stringify({ identity, chain_id: chainId }) },
    );
    if (
      !challenge.message.startsWith("Bharat Vault authentication\n") ||
      !challenge.message.includes(`Audience: ${window.location.origin}\n`) ||
      !challenge.message.includes(`DID: ${didValue(chainId, identity)}\n`)
    )
      throw new Error(
        "Authentication challenge has the wrong audience or identity.",
      );
    const signature = await v.wallet.signMessage({
      message: challenge.message,
    });
    const login = await api<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ id: challenge.id, signature }),
    });
    const me = await api<{
      identity: string;
      user_id: string;
      expires: number;
    }>("/auth/me", { headers: { Authorization: `Bearer ${login.token}` } });
    setSession(me);
  }
  return (
    <div className="grid">
      <Panel title="Your identity">
        <p>
          The identity address stays with the asset. Its current controller
          signs transactions. Switching a controller does not transfer
          ownership.
        </p>
        <Field
          label="Stable identity address"
          hint="Leave empty to use the connected wallet address. Set this after controller rotation."
        >
          <input
            value={v.identityInput}
            onChange={(e) => v.setIdentityInput(e.target.value)}
            placeholder={v.account.address ?? "0x…"}
          />
        </Field>
        {v.identity && v.account.chainId && (
          <p className="mono">{didValue(v.account.chainId, v.identity)}</p>
        )}
        {v.identityState.data && (
          <dl>
            <dt>Enrollment</dt>
            <dd>
              {
                ["Not enrolled", "Active", "Suspended"][
                  v.identityState.data.status
                ]
              }
            </dd>
            <dt>Current controller</dt>
            <dd className="mono">{v.identityState.data.controller}</dd>
            <dt>Wallet proof</dt>
            <dd>
              {v.controlsIdentity
                ? "Connected wallet is the current controller"
                : "Connected wallet is not the current controller"}
            </dd>
          </dl>
        )}
        <div className="actions">
          <button
            disabled={
              !v.ready ||
              !v.identity ||
              v.busy ||
              v.identityState.data?.status !== 0
            }
            onClick={() =>
              v.run(() =>
                v.execute(
                  "identityRegistry",
                  "enroll",
                  [v.identity],
                  `Enroll ${v.identity}`,
                ),
              )
            }
          >
            Enroll identity
          </button>
          <button
            className="secondary"
            disabled={
              !v.ready ||
              !v.controlsIdentity ||
              v.identityState.data?.status !== 1
            }
            onClick={() => v.run(authenticate)}
          >
            Prove API session
          </button>
        </div>
        {session && (
          <>
            <p className="success">
              Session proof verified at sign-in. Expires{" "}
              {new Date(session.expires * 1000).toLocaleTimeString()}.
            </p>
            <Proof value={session} />
          </>
        )}
        <details>
          <summary>Change identity controller</summary>
          <p>
            This gives the new address control of this identity's permissions
            and assets. Pending requests must be recreated after rotation.
          </p>
          <Field label="New controller">
            <input
              value={newController}
              onChange={(e) => setNewController(e.target.value)}
              placeholder="0x…"
            />
          </Field>
          <button
            disabled={!v.ready || !v.controlsIdentity || v.busy}
            onClick={() =>
              v.run(() =>
                v.execute(
                  "didRegistry",
                  "changeOwner",
                  [v.identity, addressValue(newController)],
                  `Change controller of ${v.identity} to ${newController}`,
                ),
              )
            }
          >
            Change controller
          </button>
        </details>
      </Panel>
      <Panel title="Credentials">
        <span className="badge">Not enabled</span>
        <h3>Signed credentials are a separate release gate.</h3>
        <p>
          This build uses live on-chain roles for operational permission. It
          does not issue or verify SD-JWT credentials and does not display
          sample claims as proof.
        </p>
        <p>
          Issuer hosting, encrypted private storage, a supported credential
          profile and independent presentation verification are required before
          enabling this feature.
        </p>
      </Panel>
    </div>
  );
}
