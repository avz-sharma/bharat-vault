import React, { useState } from 'react';
import { WagmiProvider, useAccount, useChainId } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig, polygonAmoy } from './wagmiConfig';
import { Navbar } from './Navbar';
import { AdminPanel } from './AdminPanel';
import { CredentialCard } from './CredentialCard';
import { CitizenAssetGrid } from './CitizenAssetGrid';
import { ShieldCheck, Lock, Database, FileCheck, Layers, Server, Cpu } from 'lucide-react';

// Create a single QueryClient instance for TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
      retry: 1,
    },
  },
});

const DashboardContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('admin');
  const [theme, setTheme] = useState<'dark' | 'palette'>(() => {
    return (localStorage.getItem('sovereign_theme') as 'dark' | 'palette') || 'dark';
  });
  const { address } = useAccount();
  const chainId = useChainId();

  // Sync theme with body class and storage
  React.useEffect(() => {
    if (theme === 'palette') {
      document.body.classList.add('theme-palette');
    } else {
      document.body.classList.remove('theme-palette');
    }
    localStorage.setItem('sovereign_theme', theme);
  }, [theme]);

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      {/* Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentTheme={theme}
        onToggleTheme={setTheme}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Quick Network Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl glass-panel text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className={`font-medium ${theme === 'palette' ? 'text-slate-700' : 'text-slate-300'}`}>
                EVM Node Status:
              </span>
              <span className={`font-mono font-semibold ${theme === 'palette' ? 'text-emerald-700' : 'text-emerald-400'}`}>
                Active &amp; Connected
              </span>
            </div>
            <span className={theme === 'palette' ? 'text-slate-300' : 'text-slate-600'}>|</span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Server className="w-3.5 h-3.5 text-[#0077B3]" />
              <span className={theme === 'palette' ? 'text-slate-600' : 'text-slate-400'}>Current Network:</span>
              <span className={`font-semibold ${theme === 'palette' ? 'text-slate-800' : 'text-slate-200'}`}>
                {chainId === polygonAmoy.id ? 'Polygon Amoy (80002)' : 'Hyperledger Besu (1337)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-md font-mono text-[11px] border transition-colors ${
                theme === 'palette'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-xs'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
              }`}
            >
              DPDP Act 2023: [Aadhaar Redacted]
            </span>
            <span
              className={`px-2.5 py-1 rounded-md font-mono text-[11px] border transition-colors ${
                theme === 'palette'
                  ? 'bg-[#E0F7FA] text-[#0077B3] border-[#0077B3]/35 font-semibold shadow-xs'
                  : 'bg-indigo-950/40 text-indigo-300 border-indigo-800/40'
              }`}
            >
              ERC-5192 Soulbound RBAC
            </span>
          </div>
        </div>

        {/* Tab Views */}
        {activeTab === 'admin' && (
          <div className="space-y-6 animate-fadeIn">
            <AdminPanel currentTheme={theme} />
          </div>
        )}

        {activeTab === 'credentials' && (
          <div className="space-y-6 animate-fadeIn">
            <CredentialCard holderAddress={address} currentTheme={theme} />
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="space-y-6 animate-fadeIn">
            <CitizenAssetGrid currentTheme={theme} />
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="glass-panel p-8 rounded-2xl relative overflow-hidden space-y-6">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <ShieldCheck className="w-6 h-6" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Architecture &amp; DPDP Act 2023 Compliance Matrix
                  </h2>
                  <p className="text-sm text-slate-400">
                    Indian Digital Public Infrastructure (DPI) aligned enterprise IAM and asset tokenization.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {/* Principle 1 */}
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                    <Lock className="w-4 h-4" />
                    Strict Zero-PII on Ledger
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Under the Digital Personal Data Protection (DPDP) Act 2023, Aadhaar numbers are strictly prohibited from touching EVM smart contracts, event logs, or block calldata. All identity references in state or test fixtures are immutably set to <code className="text-emerald-400 font-mono">[Aadhaar Redacted]</code>.
                  </p>
                </div>

                {/* Principle 2 */}
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
                    <Cpu className="w-4 h-4" />
                    Dual-DID Strategy
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <strong>Issuer Authority (<code className="text-cyan-300">did:web</code>)</strong>: Used by issuing government bodies (e.g. <code className="text-cyan-300">did:web:gov.in:identity_dept</code>), anchoring trust in Web PKI.
                    <br />
                    <strong>Citizen Holder (<code className="text-cyan-300">did:ethr</code>)</strong>: Used by citizens, backed by ERC-1056 on Hyperledger Besu &amp; Polygon Amoy for sovereign cryptographic key management.
                  </p>
                </div>

                {/* Principle 3 */}
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <Layers className="w-4 h-4" />
                    ERC-5192 Soulbound RBAC
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Institutional permissions are granted via non-transferable Soulbound Tokens (<code className="text-emerald-300">RoleSBT</code>). When Auditor Role #1 is minted, OpenZeppelin AccessManager validates role membership before allowing invocation of restricted methods like <code className="text-emerald-300">AssetNFT.mintAsset</code>.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-400">Contracts:</span>
                  <span className="text-slate-200">RoleSBT (ERC-5192) &amp; AssetNFT (AccessManaged)</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Invariants Tested (Foundry Statefuzz Passed)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="font-semibold text-slate-400">Enterprise IAM &amp; Digital Asset Platform</span>
            <span>- React 18 / TypeScript / Wagmi v2</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Hyperledger Besu (1337)</span>
            <span>&bull;</span>
            <span>Polygon Amoy (80002)</span>
            <span>&bull;</span>
            <span>IETF SD-JWT</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DashboardContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;
