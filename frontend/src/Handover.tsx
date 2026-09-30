import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress, zeroHash, type Address } from "viem";
import { Field, Form, Panel, Proof } from "./components";
import type { Vault } from "./useVault";
import { integerValue } from "./validation";
import type { AssetData } from "./Assets";
type Request = {
  tokenId: bigint;
  from: Address;
  to: Address;
  manager: Address;
  fromController: Address;
  toController: Address;
  deadline: bigint;
  policyVersion: bigint;
  state: number;
};
export default function Handover({ vault: v }: { vault: Vault }) {
  const [input, setInput] = useState("");
  const [id, setId] = useState<bigint>();
  const request = useQuery({
    queryKey: [
      "handover",
      v.account.chainId,
      v.manifest?.contracts.assetNFT.address,
      id?.toString(),
    ],
    enabled: v.ready && id !== undefined,
    queryFn: async () => {
      const r = await v.read<Request>("assetNFT", "getRequest", [id]);
      if (!r.state) throw new Error("Request does not exist.");
      const [
        asset,
        owner,
        fromController,
        toController,
        fromAllowed,
        toAllowed,
        managerAllowed,
      ] = await Promise.all([
        v.read<AssetData>("assetNFT", "assets", [r.tokenId]),
        v.read<Address>("assetNFT", "ownerOf", [r.tokenId]),
        v.read<Address>("identityRegistry", "controller", [r.from]),
        v.read<Address>("identityRegistry", "controller", [r.to]),
        v.read<boolean>("identityRegistry", "can", [
          r.from,
          1,
          v.identityState.data?.scope,
        ]),
        v.read<boolean>("identityRegistry", "can", [
          r.to,
          2,
          v.identityState.data?.scope,
        ]),
        v.read<boolean>("identityRegistry", "can", [
          r.manager,
          4,
          v.identityState.data?.scope,
        ]),
      ]);
      return {
        r,
        asset,
        owner,
        fromController,
        toController,
        fromAllowed,
        toAllowed,
        managerAllowed,
      };
    },
    retry: false,
    refetchInterval: 5000,
  });
  const data = request.data;
  const isRecipient =
    v.identity?.toLowerCase() === data?.r.to.toLowerCase() &&
    v.controlsIdentity;
  return (
    <Panel title="Verified handover">
      <p>
        Look up the owner's request, inspect current checks, then approve or
        accept. The contract repeats all checks when the transaction executes.
      </p>
      <Form onSubmit={() => v.run(() => setId(integerValue(input)))}>
        <Field label="Request ID">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="numeric"
            required
          />
        </Field>
        <button disabled={!v.ready || !v.identityState.data}>
          Inspect request
        </button>
      </Form>
      {request.isError && (
        <p role="alert" className="notice">
          {request.error.message.split("\n")[0]}
        </p>
      )}
      {data && (
        <>
          <div className="handover-path">
            <div>
              <small>From identity</small>
              <code>{data.r.from}</code>
            </div>
            <span>→</span>
            <div>
              <small>To identity</small>
              <code>{data.r.to}</code>
            </div>
          </div>
          <dl>
            <dt>Asset</dt>
            <dd>#{data.r.tokenId.toString()}</dd>
            <dt>Request state</dt>
            <dd>
              {["Unknown", "Pending", "Completed", "Cancelled"][data.r.state]}
            </dd>
            <dt>Identity</dt>
            <dd>
              {data.fromController.toLowerCase() ===
                data.r.fromController.toLowerCase() &&
              data.toController.toLowerCase() ===
                data.r.toController.toLowerCase()
                ? "Controllers match request"
                : "Controller changed — new request required"}
            </dd>
            <dt>Permission</dt>
            <dd>
              {data.fromAllowed && data.toAllowed
                ? "Sender and recipient currently allowed"
                : "Permission missing or revoked"}
            </dd>
            <dt>Ownership</dt>
            <dd>
              {data.owner.toLowerCase() === data.r.from.toLowerCase()
                ? "Current owner matches sender"
                : "Owner changed"}
            </dd>
            <dt>Manager</dt>
            <dd>
              {!data.asset[6]
                ? "Not required"
                : data.managerAllowed
                  ? "Approving identity has current Manager permission; transaction checks approval version"
                  : "Approval missing or Manager revoked"}
            </dd>
            <dt>Physical evidence</dt>
            <dd>
              {data.asset[2] === zeroHash
                ? "Not required for this digital asset"
                : "Unavailable — physical handover disabled"}
            </dd>
            <dt>Expires</dt>
            <dd>{new Date(Number(data.r.deadline) * 1000).toLocaleString()}</dd>
          </dl>
          <p className="notice">
            Simulation also checks membership versions, controller history,
            policy changes and expiry. These checks may reject a request even if
            earlier checks passed.
          </p>
          <div className="actions">
            <button
              className="secondary"
              disabled={
                !v.ready ||
                v.busy ||
                !v.controlsIdentity ||
                !v.identityState.data?.roles[1] ||
                data.r.state !== 1
              }
              onClick={() =>
                v.run(() =>
                  v.execute(
                    "assetNFT",
                    "approveHandover",
                    [v.identity, id],
                    `Approve request #${id}`,
                  ),
                )
              }
            >
              Approve as Manager
            </button>
            <button
              disabled={
                !isRecipient ||
                v.busy ||
                data.r.state !== 1 ||
                data.asset[2] !== zeroHash
              }
              onClick={() =>
                v.run(() =>
                  v.execute(
                    "assetNFT",
                    "acceptHandover",
                    [
                      id,
                      {
                        nonce: zeroHash,
                        evidence: zeroHash,
                        issuedAt: 0n,
                        deadline: 0n,
                        verifier: zeroAddress,
                        signature: "0x",
                      },
                    ],
                    `Accept request #${id} for asset #${data.r.tokenId}`,
                  ),
                )
              }
            >
              Accept handover
            </button>
            <button
              className="secondary"
              disabled={
                v.busy ||
                !v.controlsIdentity ||
                data.r.state !== 1 ||
                ![data.r.from.toLowerCase(), data.r.to.toLowerCase()].includes(
                  v.identity?.toLowerCase() ?? "",
                )
              }
              onClick={() =>
                v.run(() =>
                  v.execute(
                    "assetNFT",
                    "cancelHandover",
                    [id],
                    `Cancel request #${id}`,
                  ),
                )
              }
            >
              Cancel request
            </button>
          </div>
          <Proof value={data} />
        </>
      )}
    </Panel>
  );
}
