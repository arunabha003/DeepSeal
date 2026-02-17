"use client";

import { useState } from "react";
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
import { Card, CardTitle, Stat, Badge, Button } from "@/components/ui";
import { formatUnits, truncAddr } from "@/lib/utils";

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
  const vaultName = (vaultData?.[2]?.result as string) ?? "RWA Vault";
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
            value={truncAddr(assetAddr)}
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
            <DepositCard />
            <WithdrawCard />
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
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <Card>
      <CardTitle>Mint dUSD</CardTitle>
      <p className="text-xs text-muted mb-3">Owner-only test helper</p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Amount"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          className="flex-1 font-mono"
        />
        <Button
          disabled={isPending || confirming || !amt}
          onClick={() =>
            writeContract({
              address: DUSD,
              abi: DemoUSDABI,
              functionName: "mint",
              args: [address!, parseUnits(amt, 6)],
            })
          }
        >
          {confirming ? "Confirming..." : isPending ? "Signing..." : "Mint"}
        </Button>
      </div>
      {isSuccess && (
        <p className="text-xs text-success mt-2">Minted {amt} dUSD</p>
      )}
    </Card>
  );
}

/* ───────────────────────────────── Approve ────────── */
function ApproveCard({ allowance }: { allowance: bigint }) {
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <Card>
      <CardTitle>Approve Vault</CardTitle>
      <p className="text-xs text-muted mb-3">
        Current allowance: {formatUnits(allowance, 6)} dUSD
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Amount"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          className="flex-1 font-mono"
        />
        <Button
          disabled={isPending || confirming || !amt}
          onClick={() =>
            writeContract({
              address: DUSD,
              abi: DemoUSDABI,
              functionName: "approve",
              args: [VAULT, parseUnits(amt, 6)],
            })
          }
        >
          {confirming ? "Confirming..." : isPending ? "Signing..." : "Approve"}
        </Button>
      </div>
      {isSuccess && (
        <p className="text-xs text-success mt-2">Approved {amt} dUSD</p>
      )}
    </Card>
  );
}

/* ───────────────────────────────── Deposit ────────── */
function DepositCard() {
  const { address } = useAccount();
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <Card>
      <CardTitle>Deposit dUSD</CardTitle>
      <p className="text-xs text-muted mb-3">Receive vault shares (compliance-gated)</p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Amount"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          className="flex-1 font-mono"
        />
        <Button
          disabled={isPending || confirming || !amt}
          onClick={() =>
            writeContract({
              address: VAULT,
              abi: RWAVaultABI,
              functionName: "deposit",
              args: [parseUnits(amt, 6), address!],
            })
          }
        >
          {confirming ? "Confirming..." : isPending ? "Signing..." : "Deposit"}
        </Button>
      </div>
      {isSuccess && (
        <p className="text-xs text-success mt-2">Deposited {amt} dUSD</p>
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
function WithdrawCard() {
  const { address } = useAccount();
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <Card>
      <CardTitle>Withdraw</CardTitle>
      <p className="text-xs text-muted mb-3">Burn shares, receive dUSD (compliance-gated)</p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Assets to withdraw"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          className="flex-1 font-mono"
        />
        <Button
          disabled={isPending || confirming || !amt}
          onClick={() =>
            writeContract({
              address: VAULT,
              abi: RWAVaultABI,
              functionName: "withdraw",
              args: [parseUnits(amt, 6), address!, address!],
            })
          }
        >
          {confirming ? "Confirming..." : isPending ? "Signing..." : "Withdraw"}
        </Button>
      </div>
      {isSuccess && (
        <p className="text-xs text-success mt-2">Withdrawn {amt} dUSD</p>
      )}
      {error && (
        <p className="text-xs text-danger mt-2 break-all">
          {(error as any).shortMessage || error.message}
        </p>
      )}
    </Card>
  );
}
