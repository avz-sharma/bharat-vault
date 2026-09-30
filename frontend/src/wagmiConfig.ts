import { createConfig, http, injected } from "wagmi";
import { defineChain } from "viem";
import { foundry, polygonAmoy } from "wagmi/chains";
export const besu = defineChain({
  id: 1337,
  name: "Besu",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_BESU_RPC_URL ?? "http://127.0.0.1:8546"],
    },
  },
  testnet: true,
});
export const wagmiConfig = createConfig({
  chains: [foundry, besu, polygonAmoy],
  connectors: [injected()],
  transports: {
    [foundry.id]: http("http://127.0.0.1:8545"),
    [besu.id]: http(besu.rpcUrls.default.http[0]),
    [polygonAmoy.id]: http(
      import.meta.env.VITE_AMOY_RPC_URL ?? polygonAmoy.rpcUrls.default.http[0],
    ),
  },
});
