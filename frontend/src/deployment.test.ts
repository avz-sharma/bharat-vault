import { describe, expect, it } from "vitest";
import { keccak256, type PublicClient } from "viem";
import { checkDeployment, type Deployment } from "./deployment";
const item = {
  address: "0x1111111111111111111111111111111111111111",
  deploymentBlock: "1",
  codeHash: keccak256("0x1234"),
} as const;
const manifest: Deployment = {
  abiVersion: 1,
  chainId: 31337,
  startBlock: "1",
  confirmations: 1,
  environment: "test",
  contracts: { didRegistry: item, identityRegistry: item, assetNFT: item },
};
const client = (code = "0x1234", chainId = 31337) =>
  ({
    getCode: async () => code,
    getChainId: async () => chainId,
  }) as unknown as PublicClient;
describe("deployment write gate", () => {
  it("accepts matching chain and deployed bytecode", async () =>
    expect(await checkDeployment(client(), manifest, 31337)).toBe(manifest));
  it("blocks missing code", async () =>
    expect(checkDeployment(client("0x"), manifest, 31337)).rejects.toThrow());
  it("blocks mismatched code", async () =>
    expect(
      checkDeployment(client("0xabcd"), manifest, 31337),
    ).rejects.toThrow());
  it("blocks unsupported/wrong chain", async () =>
    expect(checkDeployment(client(), manifest, 80002)).rejects.toThrow());
  it("blocks wrong RPC chain", async () =>
    expect(
      checkDeployment(client("0x1234", 1337), manifest, 31337),
    ).rejects.toThrow());
});
