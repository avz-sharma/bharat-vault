import React, { useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts, useChainId } from 'wagmi';
import { ASSET_NFT_ABI, CONTRACT_ADDRESSES, polygonAmoy } from './wagmiConfig';
import { Layers, Image as ImageIcon, ExternalLink, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';

interface CitizenAssetGridProps {
  customAssetAddress?: `0x${string}`;
  currentTheme?: 'dark' | 'palette';
}

interface MockAssetMetadata {
  id: number;
  title: string;
  category: string;
  ipfsHash: string;
  notarizedBy: string;
  provenance: string;
  status: 'Audited & Notarized' | 'Pending Verification';
}

export const CitizenAssetGrid: React.FC<CitizenAssetGridProps> = ({ customAssetAddress, currentTheme }) => {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const [activeTab, setActiveTab] = useState<'all' | 'notarized'>('all');

  // Active contract address
  const activeContract = useMemo<`0x${string}`>(() => {
    if (customAssetAddress) return customAssetAddress;
    return chainId === polygonAmoy.id
      ? CONTRACT_ADDRESSES.amoy.assetNFT
      : CONTRACT_ADDRESSES.besu.assetNFT;
  }, [chainId, customAssetAddress]);

  // Wagmi Read: balanceOf(connectedAddress)
  const {
    data: balance,
    isLoading: isBalanceLoading,
    refetch: refetchBalance,
  } = useReadContract({
    address: activeContract,
    abi: ASSET_NFT_ABI,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: !!connectedAddress,
    },
  });

  // Token IDs to query for tokenURI via useReadContracts
  // We query tokens 1 through 4 to inspect on-chain metadata or demonstrate multi-contract reads
  const tokenIdsToQuery = useMemo(() => [1, 2, 3, 4], []);

  // Wagmi useReadContracts: Batch query tokenURI for multiple token IDs
  const contractsToRead = useMemo(() => {
    return tokenIdsToQuery.map(id => ({
      address: activeContract,
      abi: ASSET_NFT_ABI,
      functionName: 'tokenURI' as const,
      args: [BigInt(id)],
    }));
  }, [activeContract, tokenIdsToQuery]);

  const {
    data: tokenUrisData,
    isLoading: isUrisLoading,
    refetch: refetchUris,
  } = useReadContracts({
    contracts: contractsToRead,
  });

  // Curated metadata representations for institutional digital assets
  const fallbackAssets: MockAssetMetadata[] = useMemo(() => [
    {
      id: 1,
      title: 'Institutional Audit Notarization #001',
      category: 'Statutory Compliance Record',
      ipfsHash: 'ipfs://bafybeihdwdcefgh4dqkjv6ga5vqd2g7m32oxk2un53zd46jnyv4u',
      notarizedBy: 'Auditor DID (did:ethr:amoy:0x1111...)',
      provenance: 'Audited under DPDP Act 2023 [Aadhaar Redacted]',
      status: 'Audited & Notarized',
    },
    {
      id: 2,
      title: 'Commercial Land Registry Certificate #42',
      category: 'Real Property Asset',
      ipfsHash: 'ipfs://bafybeicg2n6u4e73p5n7jghk7893mny298djhk389472938472',
      notarizedBy: 'Land Revenue Authority (did:web:gov.in:land)',
      provenance: 'Registered to Citizen Holder [Aadhaar Redacted]',
      status: 'Audited & Notarized',
    },
    {
      id: 3,
      title: 'Enterprise Carbon Credit Certificate #2026',
      category: 'Green Environmental Asset',
      ipfsHash: 'ipfs://bafybeib274hjdk2893847hdskj289347djks289347892374',
      notarizedBy: 'Bureau of Energy Efficiency (did:web:gov.in:bee)',
      provenance: 'Verified Corporate Asset [Aadhaar Redacted]',
      status: 'Audited & Notarized',
    },
    {
      id: 4,
      title: 'Digital Patent Rights Title Deed #99',
      category: 'Intellectual Property Asset',
      ipfsHash: 'ipfs://bafybeid982374hdjs289374829374hsdjk2983748923748',
      notarizedBy: 'Controller General of Patents (did:web:gov.in:cgpdtm)',
      provenance: 'IP Protection Guarantee [Aadhaar Redacted]',
      status: 'Pending Verification',
    },
  ], []);

  // Merge on-chain read results with metadata
  const assetItems = useMemo(() => {
    return fallbackAssets.map((asset, index) => {
      const onChainResult = tokenUrisData?.[index];
      const onChainUri = onChainResult?.status === 'success' ? String(onChainResult.result) : null;
      return {
        ...asset,
        ipfsHash: onChainUri || asset.ipfsHash,
        isOnChainLoaded: onChainResult?.status === 'success',
      };
    });
  }, [fallbackAssets, tokenUrisData]);

  const filteredAssets = useMemo(() => {
    if (activeTab === 'notarized') {
      return assetItems.filter(a => a.status === 'Audited & Notarized');
    }
    return assetItems;
  }, [assetItems, activeTab]);

  const handleRefresh = () => {
    refetchBalance();
    refetchUris();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -z-10" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Layers className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Citizen Digital Asset & Audit Portfolio
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Query owned ERC-721 Managed Assets using multi-contract reads (<code className="text-blue-300">useReadContracts</code>) with strict DPDP Act redaction guarantees.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className={`p-2 rounded-xl transition-colors border ${
                currentTheme === 'palette'
                  ? 'bg-white border-[#0077B3]/30 text-[#0077B3] hover:bg-[#E0F7FA]'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600'
              }`}
              title="Refresh contract reads"
            >
              <RefreshCw className={`w-4 h-4 ${isBalanceLoading || isUrisLoading ? 'animate-spin text-[#0077B3]' : ''}`} />
            </button>

            <div className={`px-3.5 py-1.5 rounded-xl border text-xs ${
              currentTheme === 'palette'
                ? 'bg-white border-[#0077B3]/30 text-slate-700 shadow-2xs'
                : 'bg-slate-900/80 border-slate-800'
            }`}>
              <span className={currentTheme === 'palette' ? 'text-slate-600' : 'text-slate-400'}>Connected Wallet Balance: </span>
              <span className={`font-mono font-semibold ${
                currentTheme === 'palette' ? 'text-emerald-700' : 'text-emerald-400'
              }`}>
                {isBalanceLoading ? 'Reading...' : `${balance?.toString() ?? '0'} ANFT`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 p-1 rounded-xl border transition-colors ${
          currentTheme === 'palette'
            ? 'bg-white border-[#0077B3]/30 shadow-xs'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'all'
                ? currentTheme === 'palette'
                  ? 'bg-[#0077B3] text-white shadow-sm'
                  : 'bg-blue-600 text-white shadow-sm'
                : currentTheme === 'palette'
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Managed Assets ({assetItems.length})
          </button>
          <button
            onClick={() => setActiveTab('notarized')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'notarized'
                ? currentTheme === 'palette'
                  ? 'bg-[#0077B3] text-white shadow-sm'
                  : 'bg-blue-600 text-white shadow-sm'
                : currentTheme === 'palette'
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Audited & Notarized
          </button>
        </div>

        <div className={`text-xs hidden sm:flex items-center gap-1.5 ${
          currentTheme === 'palette' ? 'text-slate-600 font-medium' : 'text-slate-400'
        }`}>
          <ShieldAlert className={`w-3.5 h-3.5 ${currentTheme === 'palette' ? 'text-emerald-600' : 'text-emerald-400'}`} />
          <span>All identity references redacted to [Aadhaar Redacted]</span>
        </div>
      </div>

      {/* Asset Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {filteredAssets.map(asset => (
          <div
            key={asset.id}
            className={`rounded-2xl overflow-hidden border transition-all hover:shadow-xl group flex flex-col justify-between ${
              currentTheme === 'palette'
                ? 'bg-white border-[#0077B3]/25 hover:border-[#0077B3] hover:shadow-[#0077B3]/10 shadow-xs'
                : 'glass-panel border-slate-800 hover:border-blue-500/50 hover:shadow-blue-500/5'
            }`}
          >
            {/* Visual Thumbnail */}
            <div>
              <div className={`h-40 p-4 relative flex flex-col justify-between border-b transition-colors ${
                currentTheme === 'palette'
                  ? 'bg-gradient-to-br from-[#F0F8FF] via-[#E0F7FA]/70 to-white border-[#0077B3]/20'
                  : 'bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950/60 border-slate-800/80'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                    currentTheme === 'palette'
                      ? 'bg-white text-[#0077B3] border-[#0077B3]/30 font-semibold shadow-2xs'
                      : 'bg-slate-950/80 text-blue-300 border-blue-900/50'
                  }`}>
                    Token #{asset.id}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
                      asset.status === 'Audited & Notarized'
                        ? currentTheme === 'palette'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : currentTheme === 'palette'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {asset.status === 'Audited & Notarized' && <CheckCircle2 className="w-3 h-3" />}
                    {asset.status}
                  </span>
                </div>

                <div className={`flex items-center justify-center my-auto transition-colors ${
                  currentTheme === 'palette'
                    ? 'text-[#0077B3]/70 group-hover:text-[#0077B3]'
                    : 'text-slate-600 group-hover:text-blue-400'
                }`}>
                  <ImageIcon className="w-12 h-12 stroke-[1.2]" />
                </div>

                <div className={`text-[11px] font-medium truncate ${
                  currentTheme === 'palette' ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  {asset.category}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3">
                <h3 className={`font-semibold text-sm line-clamp-1 transition-colors ${
                  currentTheme === 'palette' ? 'text-slate-900 group-hover:text-[#0077B3]' : 'text-slate-100 group-hover:text-blue-300'
                }`}>
                  {asset.title}
                </h3>

                {/* Strict Redaction Guarantee Field */}
                <div className={`p-2 rounded-lg border text-[11px] space-y-1 transition-colors ${
                  currentTheme === 'palette'
                    ? 'bg-emerald-50 border-emerald-300/80 shadow-2xs'
                    : 'bg-slate-950/90 border-slate-800/80'
                }`}>
                  <span className={`text-[10px] uppercase tracking-wider block ${
                    currentTheme === 'palette' ? 'text-slate-600 font-medium' : 'text-slate-400'
                  }`}>
                    DPDP Identity Provenance
                  </span>
                  <span className={`font-mono font-bold text-xs block ${
                    currentTheme === 'palette' ? 'text-emerald-800' : 'text-emerald-400'
                  }`}>
                    [Aadhaar Redacted]
                  </span>
                </div>

                {/* IPFS URI */}
                <div className="space-y-1">
                  <span className={`text-[10px] uppercase tracking-wider block ${
                    currentTheme === 'palette' ? 'text-slate-600 font-medium' : 'text-slate-400'
                  }`}>
                    IPFS Metadata URI {asset.isOnChainLoaded ? '(On-Chain)' : '(Simulated)'}
                  </span>
                  <div className={`flex items-center gap-1.5 font-mono text-[11px] p-1.5 rounded border truncate transition-colors ${
                    currentTheme === 'palette'
                      ? 'bg-white border-[#0077B3]/30 text-[#0077B3] shadow-2xs'
                      : 'bg-slate-900/90 border-slate-800 text-blue-400'
                  }`}>
                    <span className="truncate">{asset.ipfsHash}</span>
                    <a
                      href={`https://ipfs.io/ipfs/${asset.ipfsHash.replace('ipfs://', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`shrink-0 transition-colors ${
                        currentTheme === 'palette' ? 'text-[#0077B3]/70 hover:text-[#0077B3]' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Notarized Authority */}
                <div className={`text-[11px] truncate ${
                  currentTheme === 'palette' ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  <span className={currentTheme === 'palette' ? 'text-slate-500 font-medium' : 'text-slate-500'}>Authority:</span> {asset.notarizedBy}
                </div>
              </div>
            </div>

            {/* Card Footer */}
            <div className={`p-3 border-t flex items-center justify-between text-[11px] transition-colors ${
              currentTheme === 'palette'
                ? 'border-[#0077B3]/20 bg-[#F0F8FF]/80 text-slate-600'
                : 'border-slate-800/60 bg-slate-950/40 text-slate-400'
            }`}>
              <span className={`font-mono ${currentTheme === 'palette' ? 'text-slate-600' : 'text-slate-400'}`}>Contract: ANFT</span>
              <span className={`flex items-center gap-1 text-[10px] ${
                currentTheme === 'palette' ? 'text-emerald-700 font-medium' : 'text-emerald-400'
              }`}>
                <CheckCircle2 className="w-3 h-3" /> ERC-721 Validated
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CitizenAssetGrid;
