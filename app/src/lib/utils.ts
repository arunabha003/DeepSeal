import { BLOCK_EXPLORER, ERC8004_EXPLORER, ERC8004_CHAIN_SLUG } from "@/lib/network";

export function truncAddr(addr: string, chars = 4): string {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function formatScore(score: number): string {
  return (score / 10).toFixed(1) + "%";
}

export function formatTimestamp(ts: number | bigint): string {
  const n = Number(ts);
  if (n === 0) return "--";
  return new Date(n * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatUnits(value: bigint, decimals: number): string {
  const str = value.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, str.length - decimals) || "0";
  const frac = str.slice(str.length - decimals);
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function parseUnits(value: string, decimals: number): bigint {
  const [whole = "0", frac = ""] = value.split(".");
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/* ── Block explorer link helpers ────────────────────── */
export function txUrl(hash: string): string {
  return `${BLOCK_EXPLORER}/tx/${hash}`;
}

export function addressUrl(addr: string): string {
  return `${BLOCK_EXPLORER}/address/${addr}`;
}

export function tokenUrl(addr: string, id?: string | number | bigint): string {
  if (id !== undefined) return `${BLOCK_EXPLORER}/token/${addr}?a=${id}`;
  return `${BLOCK_EXPLORER}/token/${addr}`;
}

/* ── ERC-8004 explorer link helpers ────────────────── */
export function agentUrl(agentId: string | number | bigint): string {
  return `${ERC8004_EXPLORER}/agents/${ERC8004_CHAIN_SLUG}/${agentId}`;
}

export function erc8004ExplorerUrl(): string {
  return `${ERC8004_EXPLORER}/agents`;
}
