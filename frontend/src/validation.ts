import {
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
export function addressValue(value: string): Address {
  if (!isAddress(value) || value.toLowerCase() === zeroAddress)
    throw new Error("Enter a valid nonzero address.");
  return getAddress(value);
}
export function integerValue(value: string, max = (1n << 256n) - 1n): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > max)
    throw new Error("Enter a whole nonnegative integer in range.");
  return BigInt(value);
}
export function commitmentValue(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0{64}$/.test(value))
    throw new Error("Enter a nonzero 32-byte commitment.");
  return value as Hex;
}
export function didValue(chainId: number, identity: Address): string {
  return `did:ethr:0x${chainId.toString(16)}:${identity.toLowerCase()}`;
}
export function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message.split("\n")[0]
    : "The operation failed.";
}
