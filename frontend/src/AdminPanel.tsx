import React, { useState, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { isAddress, decodeErrorResult, BaseError, ContractFunctionRevertedError } from 'viem';
import { Shield, CheckCircle2, AlertTriangle, ExternalLink, Loader2, UserCheck, KeyRound, Sparkles, RefreshCw } from 'lucide-react';
import { ROLE_SBT_ABI, CONTRACT_ADDRESSES, hyperledgerBesu, polygonAmoy } from './wagmiConfig';
import { PRESET_ROLES } from './types/credentials';

interface AdminPanelProps {
  customContractAddress?: `0x${string}`;
  currentTheme?: 'dark' | 'palette';
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ customContractAddress, currentTheme = 'dark' }) => {
  const { address: connectedAddress, isConnected } = useAccount();
  const chainId = useChainId();

  // Form State
  const [recipient, setRecipient] = useState<string>('');
  const [roleId, setRoleId] = useState<string>('1');
  const [contractOverride, setContractOverride] = useState<string>('');

  // Determine active contract address
  const activeContract = useMemo<`0x${string}`>(() => {
    if (contractOverride && isAddress(contractOverride)) {
      return contractOverride as `0x${string}`;
    }
    if (customContractAddress) {
      return customContractAddress;
    }
    return chainId === polygonAmoy.id
      ? CONTRACT_ADDRESSES.amoy.roleSBT
      : CONTRACT_ADDRESSES.besu.roleSBT;
  }, [chainId, contractOverride, customContractAddress]);

  // Wagmi Write Contract Hook
  const {
    data: txHash,
    isPending: isWritePending,
    error: writeError,
    writeContract,
    reset: resetWrite,
  } = useWriteContract();

  // Wagmi Transaction Receipt Tracker
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Validation: limit role ID strictly between 1 and 3
  const isValidRecipient = useMemo(() => isAddress(recipient.trim()), [recipient]);
  const isValidRoleId = useMemo(() => {
    const num = Number(roleId);
    return !isNaN(num) && num >= 1 && num <= 3;
  }, [roleId]);

  // Explorer URL Resolver
  const explorerTxUrl = useMemo(() => {
    if (!txHash) return '';
    if (chainId === polygonAmoy.id) {
      return `${polygonAmoy.blockExplorers.default.url}/tx/${txHash}`;
    }
    return `${hyperledgerBesu.blockExplorers.default.url}/tx/${txHash}`;
  }, [chainId, txHash]);

  // Custom Solidity Error Decoder
  const decodedError = useMemo(() => {
    const error = writeError || receiptError;
    if (!error) return null;

    // Check if error is a Viem BaseError
    if (error instanceof BaseError) {
      const revertError = error.walk(err => err instanceof ContractFunctionRevertedError);
      
      if (revertError instanceof ContractFunctionRevertedError) {
        const errorName = revertError.data?.errorName;
        if (errorName) {
          switch (errorName) {
            case 'ErrSoulboundNonTransferable':
              return {
                title: 'ERC-5192 Soulbound Restriction',
                code: 'ErrSoulboundNonTransferable()',
                message: 'Soulbound tokens are permanently bound to the minted recipient and non-transferable.',
                severity: 'critical',
              };
            case 'OwnableUnauthorizedAccount':
              return {
                title: 'RBAC Authorization Rejection',
                code: `OwnableUnauthorizedAccount(${revertError.data?.args?.[0] || 'account'})`,
                message: 'Caller is not the contract administrator or owner authorized to mint Role SBTs.',
                severity: 'critical',
              };
            case 'ERC721InvalidReceiver':
              return {
                title: 'Invalid Receiver Address',
                code: 'ERC721InvalidReceiver(0x0)',
                message: 'The recipient address cannot be the zero address (0x0000...0000).',
                severity: 'warning',
              };
            case 'ERC721InsufficientApproval':
              return {
                title: 'Insufficient Approval',
                code: 'ERC721InsufficientApproval()',
                message: 'The caller lacks required approval to mutate this token ID.',
                severity: 'warning',
              };
            default:
              return {
                title: `Custom Error: ${errorName}`,
                code: `${errorName}(${JSON.stringify(revertError.data?.args || [])})`,
                message: `Contract reverted with custom error: ${errorName}`,
                severity: 'warning',
              };
          }
        }

        // Try decoding raw error data against ABI if errorName was not extracted
        if (revertError.data && typeof revertError.data === 'string') {
          try {
            const decoded = decodeErrorResult({
              abi: ROLE_SBT_ABI,
              data: revertError.data as `0x${string}`,
            });
            return {
              title: `Revert: ${decoded.errorName}`,
              code: `${decoded.errorName}(${JSON.stringify(decoded.args)})`,
              message: `Decoded custom contract error: ${decoded.errorName}`,
              severity: 'critical',
            };
          } catch {
            // Ignore decode failure
          }
        }
      }

      // Check User Rejection
      if (error.name.includes('UserRejectedRequestError') || error.message.includes('User rejected')) {
        return {
          title: 'Transaction Cancelled in Wallet',
          code: 'ACTION_REJECTED',
          message: 'The signature request was declined by the user in the wallet.',
          severity: 'info',
        };
      }

      // Return short clean message
      return {
        title: error.shortMessage || 'Execution Reverted',
        code: error.name,
        message: error.details || error.message,
        severity: 'critical',
      };
    }

    return {
      title: 'Contract Call Failed',
      code: 'UNKNOWN_ERROR',
      message: (error as Error).message || 'An unexpected error occurred during execution.',
      severity: 'critical',
    };
  }, [writeError, receiptError]);

  // Execute Mint Transaction
  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidRecipient || !isValidRoleId || isWritePending || isConfirming) return;

    resetWrite();

    try {
      writeContract({
        address: activeContract,
        abi: ROLE_SBT_ABI,
        functionName: 'mint',
        args: [recipient.trim() as `0x${string}`, BigInt(roleId)],
      });
    } catch (err) {
      console.error('Error submitting transaction:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Shield className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">Administrator Role SBT Minting</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Issue non-transferable ERC-5192 Soulbound Tokens (RoleSBT) to establish cryptographically verifiable RBAC.
            </p>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/50 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-mono">
              Target Contract: {activeContract.slice(0, 6)}...{activeContract.slice(-4)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Form & Preset Roles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Minting Form */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl">
          <form onSubmit={handleMint} className="space-y-5">
            {/* Target Address Input */}
            <div>
              <label htmlFor="recipient-input" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                currentTheme === 'palette' ? 'text-slate-800' : 'text-slate-300'
              }`}>
                Recipient Ethereum Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="recipient-input"
                  type="text"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="0x71C...3a9e"
                  className={`w-full px-4 py-3 rounded-xl border text-sm font-mono transition-colors focus:outline-none focus:ring-2 ${
                    currentTheme === 'palette'
                      ? recipient && !isValidRecipient
                        ? 'bg-white border-rose-400 text-rose-700 focus:ring-rose-200'
                        : 'bg-white border-[#0077B3]/30 text-slate-900 focus:border-[#0077B3] focus:ring-[#0077B3]/20 placeholder-slate-400 shadow-xs'
                      : recipient && !isValidRecipient
                      ? 'bg-slate-900/90 border-rose-500/60 focus:ring-rose-500/40 text-rose-200'
                      : 'bg-slate-900/90 border-slate-700 focus:border-[#0077B3] focus:ring-[#0077B3]/30 text-white'
                  }`}
                  disabled={isWritePending || isConfirming}
                />
                {connectedAddress && (
                  <button
                    type="button"
                    onClick={() => setRecipient(connectedAddress)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2.5 py-1 rounded-lg border transition-colors font-medium ${
                      currentTheme === 'palette'
                        ? 'bg-[#E0F7FA] text-[#0077B3] border-[#0077B3]/30 hover:bg-[#0077B3] hover:text-white'
                        : 'bg-[#0077B3]/20 text-[#0077B3] border-[#0077B3]/40 hover:bg-[#0077B3]/40'
                    }`}
                  >
                    Use Connected
                  </button>
                )}
              </div>
              {recipient && !isValidRecipient && (
                <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Please enter a valid 42-character hexadecimal EVM address.
                </p>
              )}
            </div>

            {/* Role ID & Quick Presets */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="role-id-input" className={`block text-xs font-semibold uppercase tracking-wider ${
                  currentTheme === 'palette' ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  Role Identifier (Token ID / RBAC Role) <span className="text-rose-500">*</span>
                </label>
                <span className={`text-xs font-mono ${currentTheme === 'palette' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Max Limit = 3 (1: Auditor, 2: Officer, 3: Citizen)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                {PRESET_ROLES.slice(0, 3).map(role => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setRoleId(role.id.toString())}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      roleId === role.id.toString()
                        ? currentTheme === 'palette'
                          ? 'bg-[#E0F7FA] border-[#0077B3] text-slate-900 shadow-md shadow-[#0077B3]/15 ring-1 ring-[#0077B3]'
                          : 'bg-[#0077B3]/25 border-[#0077B3] text-white shadow-lg shadow-[#0077B3]/10 ring-1 ring-[#0077B3]'
                        : currentTheme === 'palette'
                        ? 'bg-white border-[#0077B3]/20 text-slate-700 hover:border-[#0077B3]/50 hover:bg-[#F0F8FF]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${currentTheme === 'palette' ? 'text-slate-900' : 'text-white'}`}>{role.name}</span>
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        currentTheme === 'palette'
                          ? 'bg-white text-[#0077B3] font-bold border border-[#0077B3]/25'
                          : 'bg-slate-800 text-[#0077B3]'
                      }`}>
                        #{role.id}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-1 line-clamp-1 ${currentTheme === 'palette' ? 'text-slate-600' : 'text-slate-400'}`}>{role.description}</p>
                  </button>
                ))}
              </div>

              <input
                id="role-id-input"
                type="number"
                min="1"
                max="3"
                step="1"
                value={roleId}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '') {
                    setRoleId('');
                    return;
                  }
                  const num = parseInt(val, 10);
                  if (!isNaN(num)) {
                    if (num > 3) {
                      setRoleId('3');
                    } else if (num < 1) {
                      setRoleId('1');
                    } else {
                      setRoleId(num.toString());
                    }
                  }
                }}
                placeholder="1"
                className={`w-full px-4 py-3 rounded-xl border text-sm font-mono transition-colors focus:outline-none focus:ring-2 ${
                  currentTheme === 'palette'
                    ? 'bg-white border-[#0077B3]/30 text-slate-900 focus:border-[#0077B3] focus:ring-[#0077B3]/20 shadow-xs'
                    : 'bg-slate-900/90 border-slate-700 text-white focus:border-[#0077B3] focus:ring-[#0077B3]/30'
                }`}
                disabled={isWritePending || isConfirming}
              />
              <span className={`text-[11px] mt-1.5 block font-medium ${currentTheme === 'palette' ? 'text-slate-500' : 'text-slate-400'}`}>
                Role ID restricted to 1–3 (Role #1: Auditor, #2: Officer, #3: Citizen). Values above 3 are restricted.
              </span>
            </div>

            {/* Contract Address Override (Expandable) */}
            <details className={`text-xs pt-1 ${currentTheme === 'palette' ? 'text-slate-600' : 'text-slate-400'}`}>
              <summary className={`cursor-pointer select-none py-1 font-medium ${currentTheme === 'palette' ? 'hover:text-slate-900' : 'hover:text-slate-300'}`}>
                Advanced: Custom RoleSBT Contract Address
              </summary>
              <div className="mt-2 pt-2 border-t border-slate-800/80">
                <input
                  type="text"
                  value={contractOverride}
                  onChange={e => setContractOverride(e.target.value)}
                  placeholder={activeContract}
                  className={`w-full px-3 py-2 rounded-lg border font-mono text-xs focus:outline-none ${
                    currentTheme === 'palette'
                      ? 'bg-white border-[#0077B3]/30 text-slate-800 focus:border-[#0077B3]'
                      : 'bg-slate-900 border-slate-800 text-slate-300 focus:border-[#0077B3]'
                  }`}
                />
              </div>
            </details>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                id="mint-role-btn"
                type="submit"
                disabled={!isConnected || !isValidRecipient || !isValidRoleId || isWritePending || isConfirming}
                className={`w-full py-3.5 px-6 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
                  !isConnected
                    ? currentTheme === 'palette'
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : isWritePending || isConfirming
                    ? 'bg-[#0077B3]/80 text-white cursor-wait animate-pulse'
                    : 'bg-[#0077B3] hover:bg-[#006294] text-white shadow-[#0077B3]/25 active:scale-[0.99]'
                }`}
              >
                {isWritePending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Awaiting Signature in Wallet...</span>
                  </>
                ) : isConfirming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Confirming On-Chain Block Receipt...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Execute RoleSBT.mint({recipient ? `${recipient.slice(0, 6)}...` : 'to'}, {roleId || 'role'})</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* UI Status Indicators */}
          <div className="mt-6 space-y-4">
            {/* Status 1: Pending (Wallet or On-Chain) */}
            {(isWritePending || isConfirming) && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-start gap-3 animate-fadeIn">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-amber-300">
                    {isWritePending ? 'Transaction Pending Signature' : 'Transaction Mined, Waiting for Block Receipt'}
                  </h4>
                  <p className="text-xs text-amber-200/80">
                    {isWritePending
                      ? 'Please confirm the transaction in MetaMask or your injected Web3 provider.'
                      : 'Transaction broadcasted to EVM node. Confirming state inclusion on-chain.'}
                  </p>
                  {txHash && (
                    <p className="text-xs font-mono text-amber-300/90 pt-1 break-all">
                      Tx: {txHash}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Status 2: Success with Transaction Hash */}
            {isConfirmed && txHash && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 space-y-3 animate-fadeIn">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-300">Soulbound Role SBT Minted Successfully!</h4>
                      <p className="text-xs text-emerald-200/80">
                        Token #{roleId} has been irrevocably assigned to {recipient.slice(0, 8)}...{recipient.slice(-6)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={resetWrite}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800/40"
                  >
                    <RefreshCw className="w-3 h-3" /> Mint Another
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-slate-900/80 border border-emerald-900/40 text-xs font-mono">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-slate-400 shrink-0">Tx Hash:</span>
                    <span className="text-emerald-400 truncate">{txHash}</span>
                  </div>
                  {explorerTxUrl && (
                    <a
                      href={explorerTxUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 shrink-0 underline"
                    >
                      View on Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Status 3: Error with Custom Error Decoding */}
            {decodedError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-3 animate-fadeIn">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
                      <AlertTriangle className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-rose-300">{decodedError.title}</h4>
                      <p className="text-xs text-rose-200/80">{decodedError.message}</p>
                    </div>
                  </div>

                  <button
                    onClick={resetWrite}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded bg-rose-950/40 border border-rose-800/40"
                  >
                    Dismiss
                  </button>
                </div>

                {decodedError.code && (
                  <div className="p-2.5 rounded-lg bg-slate-950/90 border border-rose-900/30">
                    <span className="text-[11px] text-slate-400 block mb-0.5">Solidity Revert Signature / Error:</span>
                    <code className="text-xs text-rose-400 font-mono break-all">{decodedError.code}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: RBAC Guidance & ERC-5192 Invariants */}
        <div className="space-y-4">
          <div className="glass-panel p-5 rounded-2xl space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Role SBT Specification
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Role tokens adhere to the <span className="text-indigo-400 font-medium">ERC-5192 Minimal Soulbound Token</span> standard.
              Once minted via <code className="text-indigo-300">mint(to, roleId)</code>:
            </p>
            <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
              <li><code className="text-slate-300">locked(tokenId)</code> always evaluates to <strong className="text-emerald-400">true</strong>.</li>
              <li>Transfers revert with <code className="text-rose-400 font-mono">ErrSoulboundNonTransferable()</code>.</li>
              <li>Only authorized institutional owners can issue role credentials.</li>
              <li>Auditors receive Role #1 to notarize and mint AssetNFTs under OpenZeppelin AccessManager.</li>
            </ul>
          </div>

          <div className="glass-panel p-5 rounded-2xl border-l-4 border-indigo-500">
            <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-indigo-400" /> Compliance Check
            </h4>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              In accordance with the India DPDP Act 2023, Soulbound Tokens carry zero personal or demographic identifiers on-chain.
              Demographic claims remain secured off-chain within the citizen&apos;s SD-JWT credential.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
