import { keccak256, type Address, type Hex, type PublicClient } from "viem";
import { addressValue } from "./validation";
export type ContractName = "didRegistry" | "identityRegistry" | "assetNFT";
export type Deployment = {
  abiVersion: number;
  chainId: number;
  environment: string;
  startBlock: string;
  confirmations: number;
  contracts: Record<
    ContractName,
    { address: Address; deploymentBlock: string; codeHash: Hex }
  >;
};
export async function checkDeployment(
  client: PublicClient,
  manifest: Deployment,
  chainId: number,
) {
  if (
    manifest.abiVersion !== 1 ||
    manifest.chainId !== chainId ||
    (await client.getChainId()) !== chainId ||
    !Number.isInteger(manifest.confirmations) ||
    manifest.confirmations < 1
  )
    throw new Error("Deployment configuration does not match this network.");
  for (const name of ["didRegistry", "identityRegistry", "assetNFT"] as const) {
    const contract = manifest.contracts[name];
    const code = await client.getCode({
      address: addressValue(contract.address),
    });
    if (!code || code === "0x" || keccak256(code) !== contract.codeHash)
      throw new Error(
        `Deployment bytecode mismatch: ${name}. Writes are blocked.`,
      );
  }
  return manifest;
}
export async function loadDeployment(client: PublicClient, chainId: number) {
  const response = await fetch(`/deployments/${chainId}.json`, {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("No deployment configured for this network.");
  let manifest: Deployment;
  try {
    manifest = await response.json();
  } catch {
    throw new Error(
      "No valid deployment manifest. Run the deployment command.",
    );
  }
  return checkDeployment(client, manifest, chainId);
}
