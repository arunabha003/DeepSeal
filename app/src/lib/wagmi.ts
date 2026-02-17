import { http, createConfig } from "wagmi";
import { defineChain } from "viem";

export const anvilBaseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia (Local Fork)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  blockExplorers: {
    default: { name: "Basescan", url: "https://sepolia.basescan.org" },
  },
  testnet: true,
});

export const config = createConfig({
  chains: [anvilBaseSepolia],
  transports: {
    [anvilBaseSepolia.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
