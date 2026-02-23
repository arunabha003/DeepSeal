/**
 * Network configuration — single source of truth.
 *
 * Set NEXT_PUBLIC_NETWORK in .env.local:
 *   "local"   → Anvil fork on localhost:8545
 *   "testnet" → Real Base Sepolia (https://sepolia.base.org)
 */

export type NetworkMode = "local" | "testnet";

export const NETWORK: NetworkMode =
  (process.env.NEXT_PUBLIC_NETWORK as NetworkMode) || "local";

export const IS_LOCAL = NETWORK === "local";
export const IS_TESTNET = NETWORK === "testnet";

export const RPC_URLS: Record<NetworkMode, string> = {
  local: "http://127.0.0.1:8545",
  testnet: process.env.NEXT_PUBLIC_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl",
};

export const RPC_URL = RPC_URLS[NETWORK];

export const CHAIN_ID = 84532; // Base Sepolia — same for both modes

export const BLOCK_EXPLORER = "https://sepolia.basescan.org";

export const ERC8004_EXPLORER = "https://testnet.8004scan.io";
export const ERC8004_CHAIN_SLUG = "base-sepolia";

const parseBoolEnv = (value: string | undefined): boolean | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
};

// UI badge/control hint only. Workflow behavior is configured in CRE config files.
export const CONFIDENTIAL_HTTP_ENABLED =
  parseBoolEnv(process.env.NEXT_PUBLIC_CONFIDENTIAL_HTTP) ?? IS_TESTNET;
