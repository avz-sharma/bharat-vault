import { describe, expect, it } from "vitest";
import {
  addressValue,
  commitmentValue,
  didValue,
  integerValue,
} from "./validation";
describe("transaction inputs", () => {
  it.each(["1.5", "-1", "1e3", "Infinity", "", " 1", "01"])(
    "rejects unsafe integer %s",
    (value) => expect(() => integerValue(value)).toThrow(),
  );
  it("preserves token IDs larger than Number.MAX_SAFE_INTEGER", () =>
    expect(integerValue("9007199254740993")).toBe(9007199254740993n));
  it("enforces integer bounds", () =>
    expect(() => integerValue("33", 32n)).toThrow());
  it("rejects zero and malformed recipients", () => {
    expect(() => addressValue("0x" + "0".repeat(40))).toThrow();
    expect(() => addressValue("wrong")).toThrow();
  });
  it("requires real commitments", () => {
    expect(() => commitmentValue("0x" + "0".repeat(64))).toThrow();
    expect(() => commitmentValue("ipfs://x")).toThrow();
  });
  it("derives DID chain from the active deployment", () =>
    expect(didValue(31337, addressValue("0x" + "a".repeat(40)))).toContain(
      "did:ethr:0x7a69:",
    ));
});
