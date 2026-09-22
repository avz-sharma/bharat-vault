import { 
  createKernelAccount, 
  createKernelAccountClient, 
  createZeroDevPaymasterClient 
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { toPasskeyValidator, PasskeyValidatorContractVersion } from "@zerodev/passkey-validator";
import { http, createPublicClient, type Address, type Hex } from "viem";

// Replace with your specific Besu chain configuration
const BESU_CHAIN = {
  id: 1337, // E.g., local or permissioned testnet chain ID
  name: "Permissioned Besu",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://localhost:8545"] }, // Besu RPC URL
    public: { http: ["http://localhost:8545"] },
  },
} as const;

const BUNDLER_URL = (import.meta.env.VITE_BUNDLER_URL as string) || "http://localhost:4337";
const PAYMASTER_URL = (import.meta.env.VITE_PAYMASTER_URL as string) || "http://localhost:4337";

// Initialize clients
export const publicClient = createPublicClient({
  chain: BESU_CHAIN,
  transport: http((import.meta.env.VITE_RPC_URL as string) || "http://localhost:8545"),
});

export const paymasterClient = createZeroDevPaymasterClient({
  chain: BESU_CHAIN,
  transport: http(PAYMASTER_URL),
});

const entryPoint = getEntryPoint("0.7");

/**
 * Initializes a Kernel Smart Account instance bound to the provided WebAuthn P-256 public key.
 * Configures the ERC-4337 Bundler and sponsored Paymaster integration.
 * 
 * @param webAuthnKey The passkey instance returned from `registerPasskey` or `loginPasskey`.
 * @returns The configured Kernel Account Client ready for executing transactions.
 */
export async function initializeSmartAccountClient(webAuthnKey: any) {
  // 1. Create the Passkey Validator module
  // This module internally handles constructing the assertion signature when UserOps are signed.
  const passkeyValidator = await toPasskeyValidator(publicClient, {
    webAuthnKey,
    entryPoint,
    kernelVersion: KERNEL_V3_1,
    validatorContractVersion: PasskeyValidatorContractVersion.V0_0_2_UNPATCHED,
  });

  // 2. Initialize the ERC-4337 Smart Account instance
  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: passkeyValidator,
    },
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });

  // 3. Create the ERC-4337 Account Client with sponsored Paymaster configuration
  const kernelClient = createKernelAccountClient({
    account,
    chain: BESU_CHAIN,
    bundlerTransport: http(BUNDLER_URL),
    paymaster: {
      getPaymasterData: async (params: any) => {
        return paymasterClient.getPaymasterData(params);
      },
      getPaymasterStubData: async (params: any) => {
        return paymasterClient.getPaymasterStubData(params);
      },
    },
  });

  return kernelClient;
}

/**
 * Executes a sponsored transaction via the Paymaster using the Smart Account.
 * 
 * Under the hood, this method:
 * - Constructs the UserOperation.
 * - Requests gas limits and sponsorship data from the Paymaster (via getPaymasterData hooks).
 * - Triggers the WebAuthn validator to prompt biometric auth & sign the UserOp hash.
 * - Submits the bundled UserOp to the EntryPoint (0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789).
 */
export async function executeSponsoredTransaction(
  kernelClient: any,
  to: Address,
  value: bigint,
  data: Hex
) {
  console.log(`Executing sponsored transaction to ${to}...`);
  
  // sendTransaction abstracts all the ERC-4337 bundling and signing complexity
  const txHash = await kernelClient.sendTransaction({
    to,
    value,
    data,
  });

  console.log("UserOperation submitted. Waiting for receipt...", txHash);
  
  // Wait for the UserOp to be mined on-chain
  const receipt = await publicClient.waitForTransactionReceipt({ 
    hash: txHash 
  });

  console.log("Transaction mined successfully!");
  return receipt;
}
