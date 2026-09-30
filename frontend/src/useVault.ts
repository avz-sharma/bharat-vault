import { useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decodeEventLog,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { abis } from "./generated/abis";
import {
  checkDeployment,
  loadDeployment,
  type ContractName,
} from "./deployment";
import { addressValue, errorText } from "./validation";

export const apiUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : `Service unavailable (${response.status}).`,
    );
  }
  return response.json();
}
type Operation = {
  label: string;
  chainId: number;
  account: Address;
  contract: Address;
  state: string;
  hash?: Hex;
  block?: string;
  events?: unknown[];
  error?: string;
};
export function useVault() {
  const account = useAccount();
  const publicClient = usePublicClient({ chainId: account.chainId });
  const { data: wallet } = useWalletClient();
  const queryClient = useQueryClient();
  const [identityInput, setIdentityInput] = useState("");
  const [operation, setOperation] = useState<Operation>();
  const [localError, setLocalError] = useState("");
  const locked = useRef(false);
  const supported =
    account.chainId !== undefined &&
    [31337, 1337, 80002].includes(account.chainId);
  const identity = (() => {
    try {
      return addressValue(identityInput || account.address || "");
    } catch {
      return undefined;
    }
  })();
  const deployment = useQuery({
    queryKey: ["deployment", account.chainId],
    enabled: supported && !!publicClient,
    queryFn: () =>
      loadDeployment(publicClient as PublicClient, account.chainId!),
    retry: false,
    refetchInterval: 15000,
  });
  const manifest = deployment.data;
  async function read<T>(
    name: ContractName,
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<T> {
    if (!manifest || !publicClient || manifest.chainId !== account.chainId)
      throw new Error("Verified deployment required.");
    return publicClient.readContract({
      address: manifest.contracts[name].address,
      abi: abis[name] as Abi,
      functionName,
      args,
    }) as Promise<T>;
  }
  const identityState = useQuery({
    queryKey: [
      "identity",
      account.chainId,
      manifest?.contracts.identityRegistry.address,
      identity,
    ],
    enabled: !!manifest && !!identity,
    queryFn: async () => {
      const [controller, status, scope] = await Promise.all([
        read<Address>("identityRegistry", "controller", [identity]),
        read<number>("identityRegistry", "status", [identity]),
        read<Hex>("identityRegistry", "organization"),
      ]);
      const roles = await Promise.all(
        [1, 2, 3, 4].map((role) =>
          read<boolean>("identityRegistry", "hasRole", [identity, role, scope]),
        ),
      );
      return { controller, status, scope, roles };
    },
    refetchInterval: 5000,
    retry: false,
  });
  const controlsIdentity =
    !!identityState.data &&
    account.address?.toLowerCase() ===
      identityState.data.controller.toLowerCase();
  const ready = supported && !!manifest && !deployment.isError && !!wallet;
  const busy =
    operation?.state === "Awaiting wallet" ||
    operation?.state === "Pending confirmation";
  async function execute(
    name: ContractName,
    functionName: string,
    args: readonly unknown[],
    label: string,
  ) {
    if (locked.current) return;
    if (
      !ready ||
      !manifest ||
      !publicClient ||
      !wallet ||
      !account.address ||
      !account.chainId
    )
      throw new Error("Connect a wallet to a verified deployment first.");
    const snapshot: Operation = {
      label,
      chainId: account.chainId,
      account: account.address,
      contract: manifest.contracts[name].address,
      state: "Awaiting wallet",
    };
    locked.current = true;
    setLocalError("");
    setOperation(snapshot);
    try {
      await checkDeployment(
        publicClient as PublicClient,
        manifest,
        snapshot.chainId,
      );
      if (
        (await wallet.getChainId()) !== snapshot.chainId ||
        wallet.account.address.toLowerCase() !== snapshot.account.toLowerCase()
      )
        throw new Error("Wallet context changed. Submit again.");
      const { request } = await publicClient.simulateContract({
        address: snapshot.contract,
        abi: abis[name] as Abi,
        functionName,
        args,
        account: snapshot.account,
      });
      if ((await wallet.getChainId()) !== snapshot.chainId)
        throw new Error("Network changed during simulation. Submit again.");
      const hash = await wallet.writeContract(request);
      setOperation({ ...snapshot, hash, state: "Pending confirmation" });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: manifest.confirmations,
      });
      if (receipt.status !== "success")
        throw new Error("Transaction reverted. Ownership was not changed.");
      const decoded = receipt.logs
        .filter(
          (log) =>
            log.address.toLowerCase() === snapshot.contract.toLowerCase(),
        )
        .flatMap((log) => {
          try {
            return [
              decodeEventLog({
                abi: abis[name] as Abi,
                data: log.data,
                topics: log.topics,
              }),
            ];
          } catch {
            return [];
          }
        });
      setOperation({
        ...snapshot,
        hash: receipt.transactionHash,
        block: receipt.blockNumber.toString(),
        state: "Confirmed",
        events: decoded,
      });
      await queryClient.invalidateQueries();
    } catch (error) {
      setOperation((previous) => ({
        ...(previous ?? snapshot),
        state: "Failed",
        error: errorText(error),
      }));
    } finally {
      locked.current = false;
    }
  }
  function run(action: () => Promise<unknown> | unknown) {
    setLocalError("");
    Promise.resolve()
      .then(action)
      .catch((error) => setLocalError(errorText(error)));
  }
  return {
    account,
    wallet,
    publicClient,
    identity,
    identityInput,
    setIdentityInput,
    identityState,
    controlsIdentity,
    deployment,
    manifest,
    ready,
    busy,
    operation,
    localError,
    setLocalError,
    read,
    execute,
    run,
  };
}
export type Vault = ReturnType<typeof useVault>;
