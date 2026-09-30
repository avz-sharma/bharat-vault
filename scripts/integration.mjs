import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, http } from "viem";
import { foundry } from "viem/chains";
const client = createPublicClient({
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});
assert.equal(await client.getChainId(), 31337);
const manifest = JSON.parse(await readFile("deployments/31337.json", "utf8"));
const abis = JSON.parse(await readFile("shared/abis.json", "utf8"));
const accounts = await client.request({ method: "eth_accounts" });
const alice = accounts[3],
  bob = accounts[4],
  signer = accounts[5];
const wallet = (account) =>
  createWalletClient({
    account,
    chain: foundry,
    transport: http("http://127.0.0.1:8545"),
  });
const api = (path, body, token) =>
  fetch(`http://127.0.0.1:8000/api/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function authenticate(identity, controller) {
  const response = await api("/auth/challenge", { identity, chain_id: 31337 });
  assert.equal(response.status, 200);
  const challenge = await response.json();
  const signature = await wallet(controller).signMessage({
    message: challenge.message,
  });
  const login = await api("/auth/login", { id: challenge.id, signature });
  assert.equal(login.status, 200);
  assert.equal(
    (await api("/auth/login", { id: challenge.id, signature })).status,
    400,
  );
  const session = await login.json();
  assert.equal((await api("/auth/me", undefined, session.token)).status, 200);
  return session;
}
const first = await authenticate(alice, alice);
assert.equal(
  (await api("/auth/challenge", { identity: alice, chain_id: 80002 })).status,
  400,
);
const controllerArtifact = JSON.parse(
  await readFile(
    "contracts/out/ContractController.t.sol/ContractController.json",
    "utf8",
  ),
);
const deployed = await wallet(signer).deployContract({
  abi: controllerArtifact.abi,
  bytecode: controllerArtifact.bytecode.object,
  args: [signer],
});
const receipt = await client.waitForTransactionReceipt({ hash: deployed });
assert.equal(receipt.status, "success");
const did = manifest.contracts.didRegistry.address;
const rotation = await wallet(alice).writeContract({
  address: did,
  abi: abis.didRegistry,
  functionName: "changeOwner",
  args: [alice, receipt.contractAddress],
});
await client.waitForTransactionReceipt({ hash: rotation });
assert.equal((await api("/auth/me", undefined, first.token)).status, 401);
await authenticate(alice, signer); // real RPC ERC-1271 signature validation
const { encodeFunctionData } = await import("viem");
const restoration = await wallet(signer).writeContract({
  address: receipt.contractAddress,
  abi: controllerArtifact.abi,
  functionName: "execute",
  args: [
    did,
    encodeFunctionData({
      abi: abis.didRegistry,
      functionName: "changeOwner",
      args: [alice, alice],
    }),
  ],
});
await client.waitForTransactionReceipt({ hash: restoration });
for (const identity of [alice, bob]) {
  const inventory = await (await api(`/assets?identity=${identity}`)).json();
  assert.ok(inventory.items.length > 0);
  for (const asset of inventory.items) {
    const owner = await client.readContract({
      address: manifest.contracts.assetNFT.address,
      abi: abis.assetNFT,
      functionName: "ownerOf",
      args: [BigInt(asset.token)],
    });
    assert.equal(owner.toLowerCase(), identity.toLowerCase());
  }
}
console.log(
  "PASS: real EOA and ERC-1271 API login; nonce reuse; wrong chain; stale session rejection; both indexed inventories match ownerOf.",
);
