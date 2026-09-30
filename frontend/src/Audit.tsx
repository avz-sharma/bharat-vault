import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Vault } from "./useVault";
import { Panel, Proof } from "./components";
type Event = {
  tx: string;
  log_index: number;
  block: string;
  block_hash: string;
  name: string;
  args: unknown;
};
export default function Audit({ vault: v }: { vault: Vault }) {
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("");
  const result = useQuery({
    queryKey: ["events", v.account.chainId, offset],
    enabled: v.ready,
    retry: false,
    queryFn: async () => {
      const response = await api<{
        chain_id: number;
        contract: string;
        block: string;
        items: Event[];
        next_offset: number | null;
      }>(`/events?offset=${offset}`);
      if (
        response.chain_id !== v.account.chainId ||
        response.contract.toLowerCase() !==
          v.manifest?.contracts.assetNFT.address.toLowerCase()
      )
        throw new Error("Indexer deployment mismatch.");
      return response;
    },
  });
  return (
    <Panel title="Provenance & activity">
      <p>
        Confirmed chain events, including enrollment, role changes, issuance and
        handovers. Rejected calls are not blockchain events. The database is a
        rebuildable view.
      </p>
      <label className="field">
        <span>Filter this page by event, asset or identity</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      {result.isFetching && <p role="status">Loading events…</p>}
      {result.isError && (
        <p role="alert" className="notice">
          {result.error.message}
        </p>
      )}
      {result.data && (
        <>
          <small>Confirmed through block {result.data.block}</small>
          <ol className="timeline">
            {result.data.items
              .filter((item) =>
                JSON.stringify(item)
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )
              .map((item) => (
                <li key={`${item.tx}:${item.log_index}`}>
                  <strong>{item.name}</strong>
                  <span>
                    Block {item.block} · log {item.log_index}
                  </span>
                  <code>{item.tx}</code>
                  <Proof value={item} />
                </li>
              ))}
          </ol>
          <div className="actions">
            <button
              className="secondary"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              Previous
            </button>
            <button
              className="secondary"
              disabled={result.data.next_offset === null}
              onClick={() => setOffset(result.data!.next_offset!)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
