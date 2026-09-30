import { lazy, Suspense, useState } from "react";
import { WagmiProvider, useConnect, useDisconnect } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./wagmiConfig";
import { useVault } from "./useVault";
import { Proof } from "./components";
import Assets from "./Assets";
const Organization = lazy(() => import("./Organization"));
const Identity = lazy(() => import("./Identity"));
const Handover = lazy(() => import("./Handover"));
const Audit = lazy(() => import("./Audit"));
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});
const tabs = [
  "My Vault",
  "Handover",
  "Organization",
  "Audit",
  "Identity & Credentials",
] as const;
function VaultApp() {
  const v = useVault();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [tab, setTab] = useState<(typeof tabs)[number]>("My Vault");
  const [dark, setDark] = useState(false);
  const state = !v.account.address
    ? "Wallet disconnected"
    : !v.account.chainId || ![31337, 1337, 80002].includes(v.account.chainId)
      ? "Unsupported network — writes blocked"
      : v.deployment.isError
        ? "Deployment unavailable — writes blocked"
        : v.deployment.isFetching && !v.manifest
          ? "Checking deployment…"
          : v.ready
            ? `${v.account.chain?.name ?? v.account.chainId} · deployment verified`
            : "Waiting for wallet";
  return (
    <div className={dark ? "app dark" : "app"}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header>
        <div className="brand">
          <span className="brand-icon">B</span>
          <div>
            <strong>BHARAT VAULT</strong>
            <small>Identity. Ownership. Evidence.</small>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="secondary"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            onClick={() => setDark(!dark)}
          >
            {dark ? "Light" : "Dark"}
          </button>
          {v.account.address ? (
            <button className="secondary" onClick={() => disconnect()}>
              {v.account.address.slice(0, 6)}…{v.account.address.slice(-4)} ·
              Disconnect
            </button>
          ) : (
            <button
              disabled={isPending || !connectors.length}
              onClick={() => connect({ connector: connectors[0] })}
            >
              {isPending ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </header>
      <div className="network-bar">
        <span className={v.ready ? "dot ready" : "dot"} />
        {state}
        <span className="environment">
          {v.manifest?.environment ?? "No deployment selected"}
        </span>
      </div>
      <main id="main">
        <div className="intro">
          <div>
            <span className="eyebrow">
              YOUR ORGANIZATION, VERIFIED ON CHAIN
            </span>
            <h1>
              Know who holds it.
              <br />
              <em>Verify the handover.</em>
            </h1>
            <p>
              Manage equipment through current identity, clear permissions and
              recipient consent. Every completed handover has a chain receipt.
            </p>
          </div>
          <aside className="intro-card">
            <span>THE HANDOVER CHECK</span>
            <ol>
              <li>Current identity controller</li>
              <li>Live permission & ownership</li>
              <li>Recipient acceptance</li>
              <li>Confirmed transaction evidence</li>
            </ol>
          </aside>
        </div>
        <nav aria-label="Vault sections">
          {tabs.map((name) => (
            <button
              key={name}
              className={name === tab ? "selected" : ""}
              aria-current={name === tab ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </nav>
        {error && (
          <p role="alert" className="notice">
            Wallet connection failed: {error.message.split("\n")[0]}
          </p>
        )}
        {v.deployment.isError && (
          <p role="alert" className="notice">
            {v.deployment.error.message}
          </p>
        )}
        {v.identityState.isError && (
          <p role="alert" className="notice">
            Identity state is unavailable. Protected actions remain blocked.
          </p>
        )}
        {v.localError && (
          <p role="alert" className="notice">
            {v.localError}
          </p>
        )}
        {v.operation && (
          <section className="receipt" aria-live="polite">
            <strong>
              {v.operation.state} · {v.operation.label}
            </strong>
            <small>
              Chain {v.operation.chainId} · submitted by {v.operation.account}
            </small>
            {v.operation.hash && <code>{v.operation.hash}</code>}
            {v.operation.block && (
              <span>Confirmed in block {v.operation.block}</span>
            )}
            {v.operation.error && <p role="alert">{v.operation.error}</p>}
            <Proof value={v.operation} />
          </section>
        )}
        <Suspense fallback={<p role="status">Loading section…</p>}>
          {tab === "My Vault" && <Assets vault={v} />}
          {tab === "Handover" && <Handover vault={v} />}
          {tab === "Organization" && <Organization vault={v} />}
          {tab === "Audit" && <Audit vault={v} />}
          {tab === "Identity & Credentials" && <Identity vault={v} />}
        </Suspense>
        <footer>
          Digital equipment handover · No legal-title or physical-authenticity
          claim · Physical evidence and signed credentials are not enabled in
          this build.
        </footer>
      </main>
    </div>
  );
}
export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <VaultApp />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
