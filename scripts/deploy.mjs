import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
const local = process.argv.includes("--local");
const rpc =
  process.env.VAULT_RPC_URL ?? (local ? "http://127.0.0.1:8545" : undefined);
if (!rpc) throw new Error("VAULT_RPC_URL required");
const publicClient = createPublicClient({ transport: http(rpc) });
const chainId = await publicClient.getChainId();
if (
  local &&
  (chainId !== 31337 ||
    !["127.0.0.1", "localhost"].includes(new URL(rpc).hostname))
)
  throw new Error("Local seeding requires loopback Anvil chain 31337");
if (!local && !process.env.PRIVATE_KEY)
  throw new Error("PRIVATE_KEY required for a requested testnet deployment");
const account = local
  ? (await publicClient.request({ method: "eth_accounts" }))[0]
  : privateKeyToAccount(process.env.PRIVATE_KEY);
const address = typeof account === "string" ? account : account.address;
const wallet = createWalletClient({
  account,
  chain: { ...foundry, id: chainId },
  transport: http(rpc),
});
const contracts = {};
async function deploy(key, name, args) {
  const artifact = JSON.parse(
    await readFile(`contracts/out/${name}.sol/${name}.json`, "utf8"),
  );
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw new Error("Deployment reverted");
  const code = await publicClient.getCode({ address: receipt.contractAddress });
  contracts[key] = {
    address: receipt.contractAddress,
    deploymentBlock: receipt.blockNumber.toString(),
    codeHash: keccak256(code),
    transactionHash: hash,
  };
  return receipt.contractAddress;
}
const did = await deploy("didRegistry", "DIDRegistry", []);
const registry = await deploy("identityRegistry", "IdentityAccessRegistry", [
  did,
  keccak256(stringToHex("vault.demo.organization")),
  address,
]);
await deploy("assetNFT", "AssetNFT", [registry]);
const manifest = {
  abiVersion: 1,
  chainId,
  environment: local ? "local demonstration" : "testnet",
  startBlock: contracts.didRegistry.deploymentBlock,
  confirmations: local ? 1 : 3,
  contracts,
};
await mkdir("deployments", { recursive: true });
await mkdir("frontend/public/deployments", { recursive: true });
await writeFile(
  `deployments/${chainId}.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  `frontend/public/deployments/${chainId}.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest, null, 2));
