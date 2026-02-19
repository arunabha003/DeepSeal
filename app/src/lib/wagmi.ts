import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { RPC_URL, IS_LOCAL } from "./network";

export const anvilBaseSepolia = defineChain({
  id: 84532,
  name: IS_LOCAL ? "Base Sepolia (Local Fork)" : "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Basescan", url: "https://sepolia.basescan.org" },
  },
  testnet: true,
});

export const config = createConfig({
  chains: [anvilBaseSepolia],
  transports: {
    [anvilBaseSepolia.id]: http(RPC_URL),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
