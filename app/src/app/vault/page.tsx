"use client";

import { useState, useCallback } from "react";
import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { parseUnits } from "viem";
import { ADDRESSES } from "@/lib/addresses";
import {
  RWAVaultABI,
  DemoUSDABI,
  ComplianceRegistryABI,
} from "@/lib/abis";
import { Card, CardTitle, Stat, Badge, Button, TxLink, AddressLink } from "@/components/ui";
import { formatUnits, truncAddr, txUrl } from "@/lib/utils";

/* helper: safely parse a token amount — returns null on bad input */
function safeParse(value: string, decimals: number): bigint | null {
  try {
    if (!value || value.trim() === "" || Number.isNaN(Number(value)) || Number(value) < 0)
      return null;
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

const VAULT = ADDRESSES.RWAVault as `0x${string}`;
const DUSD = ADDRESSES.DemoUSD as `0x${string}`;
const COMP = ADDRESSES.ComplianceRegistry as `0x${string}`;

export default function VaultPage() {
  const { address, isConnected } = useAccount();

  /* ── global vault reads ─────────────────────────────── */
  const { data: vaultData } = useReadContracts({
    contracts: [
      { address: VAULT, abi: RWAVaultABI, functionName: "totalAssets" },
      { address: VAULT, abi: RWAVaultABI, functionName: "totalSupply" },
      { address: VAULT, abi: RWAVaultABI, functionName: "name" },
      { address: VAULT, abi: RWAVaultABI, functionName: "symbol" },
      { address: VAULT, abi: RWAVaultABI, functionName: "decimals" },
      { address: VAULT, abi: RWAVaultABI, functionName: "asset" },
    ],
    query: { refetchInterval: 6_000 },
  });

  const totalAssets = (vaultData?.[0]?.result as bigint) ?? 0n;
  const totalSupply = (vaultData?.[1]?.result as bigint) ?? 0n;
  const vaultName = (vaultData?.[2]?.result as string) ?? "DeepSeal Vault";
  const vaultSymbol = (vaultData?.[3]?.result as string) ?? "rvDUSD";
  const rawDecimals = vaultData?.[4]?.result;
  const vaultDecimals = typeof rawDecimals === "number" ? rawDecimals : Number((rawDecimals as bigint | undefined) ?? 6n);
  const assetAddr = (vaultData?.[5]?.result as string) ?? DUSD;

  /* ── user reads ─────────────────────────────────────── */
  const { data: userData } = useReadContracts({
    contracts: address
      ? [
          {
            address: DUSD,
            abi: DemoUSDABI,
            functionName: "balanceOf",
            args: [address],
          },
          {
            address: VAULT,
            abi: RWAVaultABI,
            functionName: "balanceOf",
            args: [address],
          },
          {
            address: COMP,
            abi: ComplianceRegistryABI,
            functionName: "isApproved",
            args: [address],
          },
          {
            address: DUSD,
            abi: DemoUSDABI,
            functionName: "allowance",
            args: [address, VAULT],
          },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 6_000 },
  });

  const dUsdBal = (userData?.[0]?.result as bigint) ?? 0n;
  const sharesBal = (userData?.[1]?.result as bigint) ?? 0n;
  const isApproved = (userData?.[2]?.result as boolean) ?? false;
  const allowance = (userData?.[3]?.result as bigint) ?? 0n;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {vaultName}
        </h1>
        <p className="text-sm text-muted mt-1">
          ERC-4626 compliance-gated vault &middot; {vaultSymbol}
        </p>
      </div>

      {/* ── Overview ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="!p-4">
          <Stat label="Total Assets" value={formatUnits(totalAssets, 6)} />
        </Card>
        <Card className="!p-4">
          <Stat label="Total Shares" value={formatUnits(totalSupply, vaultDecimals)} />
        </Card>
        <Card className="!p-4">
          <Stat
            label="Share Price"
            value={
              totalSupply > 0n
                ? (Number(totalAssets) / Number(totalSupply)).toFixed(4)
                : "1.0000"
            }
          />
        </Card>
        <Card className="!p-4">
          <Stat
            label="Underlying"
            value={<AddressLink address={assetAddr} chars={5} />}
          />
        </Card>
      </div>

      {!isConnected && (
        <Card className="border-accent/30">
          <p className="text-sm text-accent">
            Connect your wallet to interact with the vault.
          </p>
        </Card>
      )}

      {isConnected && (
        <>
          {/* ── User status ───────────────────────────── */}
          <Card>
            <CardTitle>Your Position</CardTitle>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="dUSD Balance" value={formatUnits(dUsdBal, 6)} />
              <Stat label="Vault Shares" value={formatUnits(sharesBal, vaultDecimals)} />
              <Stat
                label="Compliance"
                value={
                  <Badge variant={isApproved ? "success" : "danger"}>
                    {isApproved ? "APPROVED" : "NOT APPROVED"}
                  </Badge>
                }
              />
            </div>
          </Card>

          {!isApproved && (
            <Card className="border-warning/30">
              <p className="text-sm text-warning">
                Your address is not compliant. Deposits and withdrawals are blocked
                until the CRE workflow approves you.
              </p>
            </Card>
          )}

          {/* ── Actions ───────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-4">
            <MintDUSD />
            <ApproveCard allowance={allowance} />
            <DepositCard dUsdBal={dUsdBal} allowance={allowance} isApproved={isApproved} />
            <WithdrawCard sharesBal={sharesBal} isApproved={isApproved} vaultDecimals={vaultDecimals} />
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────────── Mint dUSD ──────── */
function MintDUSD() {
  const { address } = useAccount();
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const handleMint = useCallback(() => {
    const parsed = safeParse(amt, 6);
    if (!parsed || !address) return;
    reset();
    writeContract({
      address: DUSD,
      abi: DemoUSDABI,
      functionName: "mint",
      args: [address, parsed],
    });
  }, [amt, address, writeContract, reset]);

  return (
    <Card>
      <CardTitle>Mint dUSD</CardTitle>
      <p className="text-xs text-muted mb-3">Owner-only test helper</p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount (e.g. 10000)"
          value={amt}
          onChange={(e) => { setAmt(e.target.value); if (error) reset(); }}
          className="flex-1 font-mono"
        />
        <Button
          disabled={isPending || confirming || !safeParse(amt, 6)}
          onClick={handleMint}
        >
          {confirming ? "Confirming…" : isPending ? "Signing…" : "Mint"}
        </Button>
      </div>
      {isSuccess && hash && (
        <p className="text-xs text-success mt-2">✓ Minted {amt} dUSD — <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">View TX ↗</a></p>
      )}
      {error && (
        <p className="text-xs text-danger mt-2 break-all">
          {(error as any).shortMessage || error.message}
        </p>
      )}
    </Card>
  );
}

/* ───────────────────────────────── Approve ────────── */
function ApproveCard({ allowance }: { allowance: bigint }) {
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const handleApprove = useCallback(() => {
    const parsed = safeParse(amt, 6);
    if (!parsed) return;
    reset();
    writeContract({
      address: DUSD,
      abi: DemoUSDABI,
      functionName: "approve",
      args: [VAULT, parsed],
    });
  }, [amt, writeContract, reset]);

  return (
    <Card>
      <CardTitle>Approve Vault</CardTitle>
      <p className="text-xs text-muted mb-3">
        Current allowance: {formatUnits(allowance, 6)} dUSD
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount (e.g. 10000)"
          value={amt}
          onChange={(e) => { setAmt(e.target.value); if (error) reset(); }}
          className="flex-1 font-mono"
        />
        <Button
          disabled={isPending || confirming || !safeParse(amt, 6)}
          onClick={handleApprove}
        >
          {confirming ? "Confirming…" : isPending ? "Signing…" : "Approve"}
        </Button>
      </div>
      {isSuccess && hash && (
        <p className="text-xs text-success mt-2">✓ Approved {amt} dUSD for vault — <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">View TX ↗</a></p>
      )}
      {error && (
        <p className="text-xs text-danger mt-2 break-all">
          {(error as any).shortMessage || error.message}
        </p>
      )}
    </Card>
  );
}

/* ───────────────────────────────── Deposit ────────── */
function DepositCard({
  dUsdBal,
  allowance,
  isApproved,
}: {
  dUsdBal: bigint;
  allowance: bigint;
  isApproved: boolean;
}) {
  const { address } = useAccount();
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const parsed = safeParse(amt, 6);
  const maxDeposit = allowance < dUsdBal ? allowance : dUsdBal;
  const exceedsAllowance = parsed !== null && parsed > allowance;
  const exceedsBalance = parsed !== null && parsed > dUsdBal;

  const handleDeposit = useCallback(() => {
    if (!parsed || !address) return;
    reset();
    writeContract({
      address: VAULT,
      abi: RWAVaultABI,
      functionName: "deposit",
      args: [parsed, address],
    });
  }, [parsed, address, writeContract, reset]);

  return (
    <Card>
      <CardTitle>Deposit dUSD</CardTitle>
      <p className="text-xs text-muted mb-1">Receive vault shares (compliance-gated)</p>
      <p className="text-xs text-muted mb-3">
        Max: {formatUnits(maxDeposit, 6)} dUSD (allowance: {formatUnits(allowance, 6)})
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount (e.g. 1000)"
          value={amt}
          onChange={(e) => { setAmt(e.target.value); if (error) reset(); }}
          className="flex-1 font-mono"
        />
        <button
          type="button"
          onClick={() => setAmt(formatUnits(maxDeposit, 6))}
          className="text-[10px] text-accent hover:text-accent/80 px-1"
        >
          MAX
        </button>
        <Button
          disabled={isPending || confirming || !parsed || parsed === 0n || exceedsBalance || exceedsAllowance || !isApproved}
          onClick={handleDeposit}
        >
          {confirming ? "Confirming…" : isPending ? "Signing…" : "Deposit"}
        </Button>
      </div>
      {!isApproved && (
        <p className="text-xs text-warning mt-2">⚠ Compliance not approved — run CRE workflow first</p>
      )}
      {exceedsAllowance && !exceedsBalance && (
        <p className="text-xs text-warning mt-2">⚠ Exceeds vault allowance — approve more dUSD first</p>
      )}
      {exceedsBalance && (
        <p className="text-xs text-warning mt-2">⚠ Exceeds your dUSD balance</p>
      )}
      {isSuccess && hash && (
        <p className="text-xs text-success mt-2">✓ Deposited {amt} dUSD into vault — <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">View TX ↗</a></p>
      )}
      {error && (
        <p className="text-xs text-danger mt-2 break-all">
          {(error as any).shortMessage || error.message}
        </p>
      )}
    </Card>
  );
}

/* ───────────────────────────────── Withdraw ───────── */
function WithdrawCard({
  sharesBal,
  isApproved,
  vaultDecimals,
}: {
  sharesBal: bigint;
  isApproved: boolean;
  vaultDecimals: number;
}) {
  const { address } = useAccount();
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const parsed = safeParse(amt, 6);

  const handleWithdraw = useCallback(() => {
    if (!parsed || !address) return;
    reset();
    writeContract({
      address: VAULT,
      abi: RWAVaultABI,
      functionName: "withdraw",
      args: [parsed, address, address],
    });
  }, [parsed, address, writeContract, reset]);

  return (
    <Card>
      <CardTitle>Withdraw</CardTitle>
      <p className="text-xs text-muted mb-1">Burn shares, receive dUSD</p>
      <p className="text-xs text-muted mb-3">
        Your shares: {formatUnits(sharesBal, vaultDecimals)}
      </p>
      {sharesBal === 0n ? (
        <p className="text-xs text-warning">
          You have 0 vault shares. Deposit dUSD first to receive shares, then withdraw.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="dUSD to withdraw"
              value={amt}
              onChange={(e) => { setAmt(e.target.value); if (error) reset(); }}
              className="flex-1 font-mono"
            />
            <button
              type="button"
              onClick={() => setAmt(formatUnits(sharesBal, vaultDecimals))}
              className="text-[10px] text-accent hover:text-accent/80 px-1"
            >
              MAX
            </button>
            <Button
              disabled={isPending || confirming || !parsed || parsed === 0n}
              onClick={handleWithdraw}
            >
              {confirming ? "Confirming…" : isPending ? "Signing…" : "Withdraw"}
            </Button>
          </div>
          {isSuccess && hash && (
            <p className="text-xs text-success mt-2">✓ Withdrawn {amt} dUSD from vault — <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">View TX ↗</a></p>
          )}
          {error && (
            <p className="text-xs text-danger mt-2 break-all">
              {(error as any).shortMessage || error.message}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
