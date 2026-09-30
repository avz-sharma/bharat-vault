import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  zeroAddress,
  zeroHash,
  decodeEventLog,
} from "viem";
import { foundry } from "viem/chains";
const rpc = process.env.VAULT_RPC_URL ?? "http://127.0.0.1:8545";
if (!["localhost", "127.0.0.1"].includes(new URL(rpc).hostname))
  throw new Error("Demo seeding is loopback-only");
const client = createPublicClient({ chain: foundry, transport: http(rpc) });
assert.equal(await client.getChainId(), 31337);
const manifest = JSON.parse(await readFile("deployments/31337.json", "utf8"));
const abis = JSON.parse(await readFile("shared/abis.json", "utf8"));
const [admin, manager, auditor, alice, bob, rotated] = await client.request({
  method: "eth_accounts",
});
const receipts = [];
const read = (name, functionName, args = []) =>
  client.readContract({
    address: manifest.contracts[name].address,
    abi: abis[name],
    functionName,
    args,
  });
async function tx(actor, name, functionName, args) {
  const wallet = createWalletClient({
    account: actor,
    chain: foundry,
    transport: http(rpc),
  });
  const { request } = await client.simulateContract({
    account: actor,
    address: manifest.contracts[name].address,
    abi: abis[name],
    functionName,
    args,
  });
  const hash = await wallet.writeContract(request);
  const result = await client.waitForTransactionReceipt({ hash });
  assert.equal(result.status, "success");
  const events = result.logs.flatMap((log) => {
    try {
      return [
        decodeEventLog({ abi: abis[name], data: log.data, topics: log.topics }),
      ];
    } catch {
      return [];
    }
  });
  receipts.push({
    operation: functionName,
    actor,
    hash,
    block: result.blockNumber,
    events,
  });
  return result;
}
const scope = await read("identityRegistry", "organization");
for (const [identity, role] of [
  [manager, 2],
  [auditor, 3],
  [alice, 4],
  [bob, 4],
]) {
  if ((await read("identityRegistry", "status", [identity])) === 0)
    await tx(identity, "identityRegistry", "enroll", [identity]);
  await tx(admin, "identityRegistry", "grantRole", [
    admin,
    identity,
    role,
    scope,
    (1n << 64n) - 1n,
  ]);
}
const token = await read("assetNFT", "nextTokenId");
const metadata = JSON.stringify({
  name: "Synthetic laboratory instrument",
  description: "Local demonstration equipment. No personal data.",
});
const commitment = keccak256(stringToHex(`demo.synthetic.instrument.${token}`));
const mintArgs = [
  admin,
  alice,
  commitment,
  keccak256(stringToHex(metadata)),
  "ipfs://bafkreidemo-public-metadata",
  true,
];
for (const denied of [auditor, manager, alice]) {
  await assert.rejects(() =>
    client.simulateContract({
      account: denied,
      address: manifest.contracts.assetNFT.address,
      abi: abis.assetNFT,
      functionName: "mintAsset",
      args: [denied, ...mintArgs.slice(1)],
    }),
  );
}
await tx(admin, "assetNFT", "mintAsset", mintArgs);
const deadline = async () => (await client.getBlock()).timestamp + 3600n;
let requestId = await read("assetNFT", "nextRequestId");
await tx(alice, "assetNFT", "requestHandover", [token, bob, await deadline()]);
await tx(manager, "assetNFT", "approveHandover", [manager, requestId]);
const empty = {
  nonce: zeroHash,
  evidence: zeroHash,
  issuedAt: 0n,
  deadline: 0n,
  verifier: zeroAddress,
  signature: "0x",
};
const accept = (actor, id) =>
  tx(actor, "assetNFT", "acceptHandover", [id, empty]);
await accept(bob, requestId);
assert.equal(
  (await read("assetNFT", "ownerOf", [token])).toLowerCase(),
  bob.toLowerCase(),
);
await assert.rejects(() => accept(bob, requestId));
requestId = await read("assetNFT", "nextRequestId");
await tx(bob, "assetNFT", "requestHandover", [token, alice, await deadline()]);
await tx(manager, "assetNFT", "approveHandover", [manager, requestId]);
await tx(admin, "identityRegistry", "revokeRole", [admin, manager, 2, scope]);
await assert.rejects(() => accept(alice, requestId));
assert.equal(
  (await read("assetNFT", "ownerOf", [token])).toLowerCase(),
  bob.toLowerCase(),
);
await tx(admin, "identityRegistry", "grantRole", [
  admin,
  manager,
  2,
  scope,
  (1n << 64n) - 1n,
]);
await assert.rejects(() => accept(alice, requestId));
await tx(manager, "assetNFT", "approveHandover", [manager, requestId]);
await accept(alice, requestId);
await tx(alice, "didRegistry", "changeOwner", [alice, rotated]);
await assert.rejects(() =>
  tx(alice, "assetNFT", "requestHandover", [token, bob, 9999999999n]),
);
await client.request({ method: "evm_mine" });
requestId = await read("assetNFT", "nextRequestId");
await tx(rotated, "assetNFT", "requestHandover", [
  token,
  bob,
  await deadline(),
]);
await tx(manager, "assetNFT", "approveHandover", [manager, requestId]);
await accept(bob, requestId);
await tx(rotated, "didRegistry", "changeOwner", [alice, alice]);
// Inventory deliberately includes token IDs beyond the old hardcoded range 1–4.
for (let i = 0; i < 5; i++) {
  const id = await read("assetNFT", "nextTokenId");
  await tx(admin, "assetNFT", "mintAsset", [
    admin,
    i % 2 ? alice : bob,
    keccak256(stringToHex(`demo.additional.${id}`)),
    keccak256(stringToHex(metadata)),
    "ipfs://bafkreidemo-public-metadata",
    false,
  ]);
}
await mkdir("validation", { recursive: true });
await writeFile(
  "validation/demo-receipts.json",
  JSON.stringify(
    {
      chainId: 31337,
      manifest,
      accounts: { admin, manager, auditor, alice, bob, rotated },
      testedToken: token,
      receipts,
    },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ),
);
await writeFile("validation/demo-metadata.json", metadata);
console.log(
  `PASS: shared roles; three unauthorized mint denials; consent; replay rejection; revoked and regranted approval denial; controller rotation; ${receipts.length} confirmed transactions.`,
);
