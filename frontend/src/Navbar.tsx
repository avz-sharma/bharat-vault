import React, { useState, useRef, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { hyperledgerBesu, polygonAmoy } from './wagmiConfig';
import { Shield, Wallet, LogOut, Check, ChevronDown, Radio, Sun, Moon } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentTheme?: 'dark' | 'palette';
  onToggleTheme?: (theme: 'dark' | 'palette') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentTheme = 'dark',
  onToggleTheme,
}) => {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [isNetworkMenuOpen, setIsNetworkMenuOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement>(null);

  const activeChain = chainId === polygonAmoy.id ? polygonAmoy : hyperledgerBesu;

  // Close network dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (networkDropdownRef.current && !networkDropdownRef.current.contains(event.target as Node)) {
        setIsNetworkMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80 backdrop-blur-xl transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo & Title */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('admin')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0077B3] via-cyan-500 to-[#E0F7FA] p-0.5 shadow-lg shadow-[#0077B3]/25">
              <div className="w-full h-full bg-slate-950 dark:bg-slate-950 rounded-[10px] flex items-center justify-center text-[#E0F7FA]">
                <Shield className="w-5 h-5 text-[#0077B3]" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white dark:text-white theme-light-text">
                  SovereignID
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#E0F7FA] text-[#0077B3] border border-[#0077B3]/30">
                  DPDP Act 2023
                </span>
              </div>
              <p className="text-xs text-slate-400 theme-light-subtext hidden sm:block">
                Enterprise IAM &amp; Managed Asset Platform
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 p-1 bg-slate-900/80 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'admin'
                  ? 'bg-[#0077B3] text-white shadow-md shadow-[#0077B3]/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Administrator RBAC
            </button>
            <button
              onClick={() => setActiveTab('credentials')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'credentials'
                  ? 'bg-[#0077B3] text-white shadow-md shadow-[#0077B3]/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Citizen SD-JWT Card
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'assets'
                  ? 'bg-[#0077B3] text-white shadow-md shadow-[#0077B3]/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Digital Assets
            </button>
            <button
              onClick={() => setActiveTab('compliance')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'compliance'
                  ? 'bg-[#0077B3] text-white shadow-md shadow-[#0077B3]/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Compliance Overview
            </button>
          </nav>

          {/* Wallet, Theme & Network Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Theme Toggle Button */}
            {onToggleTheme && (
              <button
                onClick={() => onToggleTheme(currentTheme === 'dark' ? 'palette' : 'dark')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors shadow-xs ${
                  currentTheme === 'palette'
                    ? 'bg-white border-[#0077B3]/30 text-slate-800 hover:bg-[#F0F8FF]'
                    : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-[#0077B3]/50'
                }`}
                title={currentTheme === 'palette' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
              >
                {currentTheme === 'palette' ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#0077B3]" />
                    <span>Dark</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light</span>
                  </>
                )}
              </button>
            )}
            {/* Chain Switcher Dropdown */}
            <div className="relative" ref={networkDropdownRef}>
              <button
                type="button"
                onClick={() => setIsNetworkMenuOpen(prev => !prev)}
                disabled={isSwitching}
                aria-expanded={isNetworkMenuOpen}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  currentTheme === 'palette'
                    ? 'bg-white border-[#0077B3]/30 text-slate-800 hover:bg-[#F0F8FF] shadow-xs'
                    : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
                } ${isNetworkMenuOpen ? (currentTheme === 'palette' ? 'ring-2 ring-[#0077B3]/25 border-[#0077B3]' : 'ring-2 ring-blue-500/25 border-blue-500/50') : ''}`}
              >
                <Radio className={`w-3.5 h-3.5 ${chainId === polygonAmoy.id ? 'text-purple-400' : 'text-cyan-400'} animate-pulse`} />
                <span className="hidden sm:inline font-mono">{activeChain.name}</span>
                <span className="sm:hidden font-mono">Chain: {activeChain.id}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isNetworkMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <div className={`header-dropdown-menu absolute right-0 mt-2 w-56 p-1.5 rounded-xl border shadow-2xl backdrop-blur-xl z-50 transition-all duration-200 before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:content-[''] ${
                isNetworkMenuOpen
                  ? 'opacity-100 translate-y-0 pointer-events-auto visible scale-100'
                  : 'opacity-0 translate-y-2 pointer-events-none invisible scale-95'
              } ${
                currentTheme === 'palette'
                  ? 'bg-white/95 border-[#0077B3]/30 text-slate-800 shadow-xl'
                  : 'bg-slate-900/95 border-slate-800 text-slate-200'
              }`}>
                <div className={`px-2.5 py-1.5 text-[10px] uppercase font-semibold tracking-wider ${
                  currentTheme === 'palette' ? 'text-slate-500' : 'text-slate-500'
                }`}>
                  Select EVM Network
                </div>

                <button
                  type="button"
                  onClick={() => {
                    switchChain({ chainId: hyperledgerBesu.id });
                    setIsNetworkMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    chainId === hyperledgerBesu.id
                      ? currentTheme === 'palette'
                        ? 'bg-[#E0F7FA] text-[#0077B3] font-semibold'
                        : 'bg-[#0077B3]/20 text-[#0077B3] font-semibold'
                      : currentTheme === 'palette'
                      ? 'text-slate-700 hover:bg-[#F0F8FF] hover:text-[#0077B3]'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span>Besu Private (1337)</span>
                  </div>
                  {chainId === hyperledgerBesu.id && <Check className="w-3.5 h-3.5 text-[#0077B3]" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    switchChain({ chainId: polygonAmoy.id });
                    setIsNetworkMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    chainId === polygonAmoy.id
                      ? currentTheme === 'palette'
                        ? 'bg-[#E0F7FA] text-[#0077B3] font-semibold'
                        : 'bg-[#0077B3]/20 text-[#0077B3] font-semibold'
                      : currentTheme === 'palette'
                      ? 'text-slate-700 hover:bg-[#F0F8FF] hover:text-[#0077B3]'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <span>Polygon Amoy (80002)</span>
                  </div>
                  {chainId === polygonAmoy.id && <Check className="w-3.5 h-3.5 text-[#0077B3]" />}
                </button>
              </div>
            </div>

            {/* Wallet Connect Button */}
            {isConnected ? (
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono transition-colors ${
                  currentTheme === 'palette'
                    ? 'bg-white border-[#0077B3]/30 text-slate-800 shadow-xs'
                    : 'bg-slate-900/90 border-slate-700/80 text-slate-200'
                }`}>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}</span>
                </div>
                <button
                  onClick={() => disconnect()}
                  className={`p-2 rounded-xl border transition-colors ${
                    currentTheme === 'palette'
                      ? 'bg-white hover:bg-rose-50 border-[#0077B3]/30 hover:border-rose-300 text-slate-500 hover:text-rose-600 shadow-xs'
                      : 'bg-slate-900 hover:bg-rose-950/40 border-slate-800 hover:border-rose-800/60 text-slate-400 hover:text-rose-400'
                  }`}
                  title="Disconnect Wallet"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  const injectedConnector = connectors.find(c => c.id === 'injected') || connectors[0];
                  if (injectedConnector) {
                    connect({ connector: injectedConnector });
                  }
                }}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0077B3] hover:bg-[#006294] text-white font-medium text-xs shadow-lg shadow-[#0077B3]/20 transition-all active:scale-[0.98]"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Tab Bar */}
        <div className="flex lg:hidden items-center justify-between pb-3 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
              activeTab === 'admin' ? 'bg-[#0077B3] text-white' : 'text-slate-400 bg-slate-900'
            }`}
          >
            Admin RBAC
          </button>
          <button
            onClick={() => setActiveTab('credentials')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
              activeTab === 'credentials' ? 'bg-[#0077B3] text-white' : 'text-slate-400 bg-slate-900'
            }`}
          >
            SD-JWT Card
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
              activeTab === 'assets' ? 'bg-[#0077B3] text-white' : 'text-slate-400 bg-slate-900'
            }`}
          >
            Assets
          </button>
          <button
            onClick={() => setActiveTab('compliance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
              activeTab === 'compliance' ? 'bg-[#0077B3] text-white' : 'text-slate-400 bg-slate-900'
            }`}
          >
            Compliance
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
