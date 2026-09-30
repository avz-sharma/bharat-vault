import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { keccak256, type Address, type Hex } from "viem";
import { Field, Form, Panel, Proof } from "./components";
import { api, type Vault } from "./useVault";
import { addressValue, integerValue } from "./validation";
type Inventory = {
  chain_id: number;
  contract: Address;
  block: string;
  block_hash: Hex;
  items: { token: string }[];
  next_offset: number | null;
};
export type AssetData = readonly [
  Hex,
  Hex,
  Hex,
  bigint,
  bigint,
  number,
  boolean,
];
export default function Assets({ vault: v }: { vault: Vault }) {
  const [offset, setOffset] = useState(0);
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<bigint>();
  const [to, setTo] = useState("");
  const [hours, setHours] = useState("24");
  const [integrity, setIntegrity] = useState("Not checked");
  const inventory = useQuery({
    queryKey: ["assets", v.account.chainId, v.identity, offset],
    enabled: v.ready && !!v.identity,
    queryFn: async () => {
      const result = await api<Inventory>(
        `/assets?identity=${v.identity}&offset=${offset}`,
      );
      if (
        result.chain_id !== v.account.chainId ||
        result.contract.toLowerCase() !==
          v.manifest?.contracts.assetNFT.address.toLowerCase()
      )
        throw new Error("The index belongs to a different deployment.");
      // Read model is evidence at a named block; each action still rechecks live state.
      return result;
    },
    retry: false,
  });
  const detail = useQuery({
    queryKey: [
      "asset",
      v.account.chainId,
      v.manifest?.contracts.assetNFT.address,
      token?.toString(),
    ],
    enabled: v.ready && token !== undefined,
    queryFn: async () => {
      const [owner, data, uri, pending] = await Promise.all([
        v.read<Address>("assetNFT", "ownerOf", [token]),
        v.read<AssetData>("assetNFT", "assets", [token]),
        v.read<string>("assetNFT", "tokenURI", [token]),
        v.read<bigint>("assetNFT", "pendingRequest", [token]),
      ]);
      return { owner, data, uri, pending };
    },
    retry: false,
    refetchInterval: 5000,
  });
  const choose = (value: string) => {
    setToken(integerValue(value));
    setIntegrity("Not checked");
  };
  const owns =
    detail.data?.owner.toLowerCase() === v.identity?.toLowerCase() &&
    v.controlsIdentity;
  return (
    <div className="grid">
      <Panel title="My assets">
        <p>
          Your confirmed inventory is indexed from transfer events. Select an
          asset to check its current owner and policy directly.
        </p>
        {!v.account.address && (
          <p className="notice">Connect a wallet to view your vault.</p>
        )}
        {inventory.isFetching && <p role="status">Loading inventory…</p>}
        {inventory.isError && (
          <p className="notice" role="alert">
            {inventory.error.message} Use the asset lookup while the index is
            unavailable.
          </p>
        )}
        {inventory.data && (
          <>
            <small>Indexed through block {inventory.data.block}</small>
            {inventory.data.items.length === 0 && (
              <p>No assets at this confirmed checkpoint.</p>
            )}
            <div className="asset-list">
              {inventory.data.items.map((item) => (
                <button
                  className="asset-item"
                  key={item.token}
                  onClick={() => v.run(() => choose(item.token))}
                >
                  <span className="asset-icon">◇</span>
                  <span>
                    Equipment asset<strong>#{item.token}</strong>
                  </span>
                  <span>Inspect →</span>
                </button>
              ))}
            </div>
            <div className="actions">
              <button
                className="secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Previous
              </button>
              <button
                className="secondary"
                disabled={inventory.data.next_offset === null}
                onClick={() => setOffset(inventory.data!.next_offset!)}
              >
                Next
              </button>
            </div>
          </>
        )}
        <Form onSubmit={() => v.run(() => choose(tokenInput))}>
          <Field label="Look up a token ID">
            <input
              inputMode="numeric"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="1"
              required
            />
          </Field>
          <button disabled={!v.ready}>Inspect asset</button>
        </Form>
      </Panel>
      <Panel title={token === undefined ? "Asset detail" : `Asset #${token}`}>
        {token === undefined && (
          <p>
            Select an asset or enter a token ID to inspect ownership and
            handover policy.
          </p>
        )}
        {detail.isFetching && !detail.data && (
          <p role="status">Checking chain state…</p>
        )}
        {detail.isError && (
          <p role="alert" className="notice">
            {detail.error.message.split("\n")[0]}
          </p>
        )}
        {detail.data && (
          <>
            <dl>
              <dt>Current identity owner</dt>
              <dd className="mono">{detail.data.owner}</dd>
              <dt>Lifecycle</dt>
              <dd>
                {
                  ["Unknown", "Active", "Suspended", "Retired"][
                    detail.data.data[5]
                  ]
                }
              </dd>
              <dt>Manager approval</dt>
              <dd>{detail.data.data[6] ? "Required" : "Not required"}</dd>
              <dt>Physical evidence</dt>
              <dd>
                {BigInt(detail.data.data[2]) === 0n
                  ? "Digital asset — no tag evidence required"
                  : "Physical binding — acceptance unavailable until hardware validation"}
              </dd>
              <dt>Pending request</dt>
              <dd>{detail.data.pending.toString()}</dd>
              <dt>Metadata integrity</dt>
              <dd>{integrity}</dd>
            </dl>
            <Field
              label="Verify a public metadata file"
              hint="Checks exact file bytes against the immutable on-chain hash. No file is uploaded."
            >
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setIntegrity("Not checked");
                  if (file)
                    v.run(async () => {
                      if (file.size > 65536)
                        throw new Error("Metadata limit: 64 KiB.");
                      const bytes = new Uint8Array(await file.arrayBuffer());
                      const parsed = JSON.parse(
                        new TextDecoder().decode(bytes),
                      );
                      if (
                        typeof parsed.name !== "string" ||
                        parsed.name.length > 120
                      )
                        throw new Error(
                          "Metadata needs a name of at most 120 characters.",
                        );
                      setIntegrity(
                        keccak256(bytes) === detail.data!.data[1]
                          ? "Verified: file hash matches chain commitment"
                          : "Invalid: file differs from chain commitment",
                      );
                    });
                }}
              />
            </Field>
            <Proof value={{ tokenId: token, ...detail.data }} />
            <Form
              onSubmit={() =>
                v.run(() =>
                  v.execute(
                    "assetNFT",
                    "requestHandover",
                    [
                      token,
                      addressValue(to),
                      BigInt(Math.floor(Date.now() / 1000)) +
                        integerValue(hours, 168n) * 3600n,
                    ],
                    `Request handover of #${token} to ${to}`,
                  ),
                )
              }
            >
              <Field label="Recipient identity">
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="0x…"
                  required
                />
              </Field>
              <Field label="Request expires in (hours)">
                <input
                  type="number"
                  min="1"
                  max="168"
                  step="1"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  required
                />
              </Field>
              <button disabled={!owns || !v.ready || v.busy}>
                Request handover
              </button>
            </Form>
          </>
        )}
      </Panel>
    </div>
  );
}
