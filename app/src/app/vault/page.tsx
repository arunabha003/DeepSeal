"use client";

import { useState, useCallback, useMemo } from "react";
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
  DiligencePortalABI,
  RWAAssetRegistryABI,
  RWAVaultFactoryABI,
} from "@/lib/abis";
import { Card, CardTitle, Stat, Badge, Button, AddressLink } from "@/components/ui";
import { formatUnits, txUrl } from "@/lib/utils";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

/* helper: safely parse a token amount — returns null on bad input */
function safeParse(value: string, decimals: number): bigint | null {
  try {
    if (!value || value.trim() === "" || Number.isNaN(Number(value)) || Number(value) < 0) {
      return null;
    }
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

function isEvmAddress(value?: string | null): value is `0x${string}` {
  return !!value && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isNonZeroAddress(value?: string | null): value is `0x${string}` {
  return isEvmAddress(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

function isBytes32(value?: string | null): value is `0x${string}` {
  return !!value && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function shortHex(value: string, start = 10, end = 8): string {
  if (!value || value.length <= start + end) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

const LEGACY_VAULT = ADDRESSES.RWAVault as `0x${string}`;
const DUSD = ADDRESSES.DemoUSD as `0x${string}`;
const COMP = ADDRESSES.ComplianceRegistry as `0x${string}`;
const PORTAL = ADDRESSES.DiligencePortal as `0x${string}`;
const ASSET_REGISTRY = ADDRESSES.RWAAssetRegistry as `0x${string}`;
const VAULT_FACTORY = ADDRESSES.RWAVaultFactory as `0x${string}`;

type Selection =
  | { kind: "request"; requestId: number }
  | { kind: "asset"; assetId: `0x${string}` };

export default function VaultPage() {
  const { address, isConnected } = useAccount();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [requestInput, setRequestInput] = useState("");
  const [assetInput, setAssetInput] = useState("");

  const hasAssetRegistry = isNonZeroAddress(ASSET_REGISTRY);
  const hasAssetFactory = isNonZeroAddress(VAULT_FACTORY);
  const hasPerAssetLookup = hasAssetRegistry || hasAssetFactory;

  const { data: nextRequestId } = useReadContract({
    address: PORTAL,
    abi: DiligencePortalABI,
    functionName: "nextRequestId",
  });

  const discoveredRequestIds = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, Number(nextRequestId ?? 0n) - 1) },
        (_, idx) => BigInt(idx + 1)
      ),
    [nextRequestId]
  );

  const { data: discoveredAssetRows } = useReadContracts({
    contracts: discoveredRequestIds.map((requestId) => ({
      address: PORTAL,
      abi: DiligencePortalABI,
      functionName: "assetIdForRequest",
      args: [requestId],
    })),
    query: { enabled: discoveredRequestIds.length > 0, refetchInterval: 10_000 },
  });

  const discoveredAssetPairs = useMemo(() => {
    const pairs: { requestId: number; assetId: `0x${string}` }[] = [];
    for (let idx = 0; idx < discoveredRequestIds.length; idx += 1) {
      const requestId = Number(discoveredRequestIds[idx]);
      const assetId = discoveredAssetRows?.[idx]?.result as string | undefined;
      if (!isBytes32(assetId) || assetId.toLowerCase() === ZERO_BYTES32) continue;
      pairs.push({ requestId, assetId });
    }
    return pairs;
  }, [discoveredRequestIds, discoveredAssetRows]);

  const { data: discoveredRegistryRows } = useReadContracts({
    contracts:
      hasAssetRegistry && discoveredAssetPairs.length > 0
        ? discoveredAssetPairs.map((pair) => ({
            address: ASSET_REGISTRY,
            abi: RWAAssetRegistryABI,
            functionName: "getAsset",
            args: [pair.assetId],
          }))
        : [],
    query: {
      enabled: hasAssetRegistry && discoveredAssetPairs.length > 0,
      refetchInterval: 10_000,
    },
  });

  const { data: discoveredFactoryVaultRows } = useReadContracts({
    contracts:
      hasAssetFactory && discoveredAssetPairs.length > 0
        ? discoveredAssetPairs.map((pair) => ({
            address: VAULT_FACTORY,
            abi: RWAVaultFactoryABI,
            functionName: "vaultByAssetId",
            args: [pair.assetId],
          }))
        : [],
    query: {
      enabled: hasAssetFactory && discoveredAssetPairs.length > 0,
      refetchInterval: 10_000,
    },
  });

  const discoveredAssetOptions = useMemo(() => {
    return discoveredAssetPairs.map((pair, idx) => {
      const regResult = discoveredRegistryRows?.[idx]?.result as
        | { subject?: string; vault?: string; exists?: boolean }
        | undefined;
      const subject = isEvmAddress(regResult?.subject) ? regResult?.subject : undefined;
      const registryVault = isNonZeroAddress(regResult?.vault) ? regResult?.vault : undefined;
      const factoryVaultRaw = discoveredFactoryVaultRows?.[idx]?.result as string | undefined;
      const factoryVault = isNonZeroAddress(factoryVaultRaw) ? factoryVaultRaw : undefined;
      const vault = registryVault || factoryVault;
      return {
        requestId: pair.requestId,
        assetId: pair.assetId,
        subject,
        vault,
      };
    });
  }, [discoveredAssetPairs, discoveredRegistryRows, discoveredFactoryVaultRows]);

  const selectedRequestId = selection?.kind === "request" ? selection.requestId : 0;
  const selectedAssetId = selection?.kind === "asset" ? selection.assetId : undefined;

  const { data: portalAssetIdData } = useReadContract({
    address: PORTAL,
    abi: DiligencePortalABI,
    functionName: "assetIdForRequest",
    args: selectedRequestId > 0 ? [BigInt(selectedRequestId)] : undefined,
    query: { enabled: selectedRequestId > 0 },
  });

  const { data: registryAssetIdData } = useReadContract({
    address: ASSET_REGISTRY,
    abi: RWAAssetRegistryABI,
    functionName: "getAssetIdByRequest",
    args: selectedRequestId > 0 ? [BigInt(selectedRequestId)] : undefined,
    query: { enabled: hasAssetRegistry && selectedRequestId > 0 },
  });

  const resolvedAssetId = useMemo(() => {
    if (selectedAssetId && isBytes32(selectedAssetId) && selectedAssetId.toLowerCase() !== ZERO_BYTES32) {
      return selectedAssetId;
    }
    const portalAssetId = portalAssetIdData as string | undefined;
    if (isBytes32(portalAssetId) && portalAssetId.toLowerCase() !== ZERO_BYTES32) {
      return portalAssetId as `0x${string}`;
    }
    const registryAssetId = registryAssetIdData as string | undefined;
    if (isBytes32(registryAssetId) && registryAssetId.toLowerCase() !== ZERO_BYTES32) {
      return registryAssetId as `0x${string}`;
    }
    return undefined;
  }, [selectedAssetId, portalAssetIdData, registryAssetIdData]);

  const { data: requestData } = useReadContract({
    address: PORTAL,
    abi: DiligencePortalABI,
    functionName: "getRequest",
    args: selectedRequestId > 0 ? [BigInt(selectedRequestId)] : undefined,
    query: { enabled: selectedRequestId > 0 },
  });

  const { data: assetRecordData } = useReadContract({
    address: ASSET_REGISTRY,
    abi: RWAAssetRegistryABI,
    functionName: "getAsset",
    args: resolvedAssetId ? [resolvedAssetId] : undefined,
    query: { enabled: hasAssetRegistry && !!resolvedAssetId },
  });

  const { data: factoryVaultData } = useReadContract({
    address: VAULT_FACTORY,
    abi: RWAVaultFactoryABI,
    functionName: "vaultByAssetId",
    args: resolvedAssetId ? [resolvedAssetId] : undefined,
    query: { enabled: hasAssetFactory && !!resolvedAssetId },
  });

  const request = requestData as
    | {
        requester: string;
        subject: string;
        docBundleHash: string;
        metadataUri: string;
        requestedAt: bigint;
      }
    | undefined;

  const assetRecord = assetRecordData as
    | {
        requestId: bigint;
        requester: string;
        subject: string;
        docBundleHash: string;
        metadataUri: string;
        requestedAt: bigint;
        approved: boolean;
        riskScore: number;
        attestationHash: string;
        decidedAt: bigint;
        vault: string;
        exists: boolean;
      }
    | undefined;

  const selectedVault = useMemo(() => {
    if (hasPerAssetLookup) {
      const registryVault = assetRecord?.vault;
      if (isNonZeroAddress(registryVault)) {
        return registryVault;
      }
      const factoryVault = factoryVaultData as string | undefined;
      if (isNonZeroAddress(factoryVault)) {
        return factoryVault;
      }
      return undefined;
    }
    return LEGACY_VAULT;
  }, [hasPerAssetLookup, assetRecord?.vault, factoryVaultData]);

  const hasResolvedVault = isNonZeroAddress(selectedVault);

  /* ── selected vault reads ───────────────────────────── */
  const { data: vaultData, isLoading: vaultLoading } = useReadContracts({
    contracts: hasResolvedVault
      ? [
          { address: selectedVault, abi: RWAVaultABI, functionName: "totalAssets" },
          { address: selectedVault, abi: RWAVaultABI, functionName: "totalSupply" },
          { address: selectedVault, abi: RWAVaultABI, functionName: "name" },
          { address: selectedVault, abi: RWAVaultABI, functionName: "symbol" },
          { address: selectedVault, abi: RWAVaultABI, functionName: "decimals" },
          { address: selectedVault, abi: RWAVaultABI, functionName: "asset" },
        ]
      : [],
    query: { enabled: hasResolvedVault, refetchInterval: 6_000 },
  });

  const hasVaultReadResults = Array.isArray(vaultData) && vaultData.length === 6;
  const vaultReadFailed =
    hasVaultReadResults &&
    vaultData.some((row) => {
      const resultRow = row as { status?: string; result?: unknown };
      return resultRow.status === "failure" || resultRow.result === undefined;
    });
  const hasReadableVault = hasResolvedVault && !vaultLoading && hasVaultReadResults && !vaultReadFailed;

  const totalAssets = (vaultData?.[0]?.result as bigint) ?? 0n;
  const totalSupply = (vaultData?.[1]?.result as bigint) ?? 0n;
  const vaultName = (vaultData?.[2]?.result as string) ?? "DeepSeal Vault";
  const vaultSymbol = (vaultData?.[3]?.result as string) ?? "rvDUSD";
  const rawVaultDecimals = vaultData?.[4]?.result;
  const vaultDecimals =
    typeof rawVaultDecimals === "number"
      ? rawVaultDecimals
      : Number((rawVaultDecimals as bigint | undefined) ?? 6n);

  const vaultAssetAddress = (vaultData?.[5]?.result as string | undefined) ?? DUSD;
  const assetToken = isEvmAddress(vaultAssetAddress) ? vaultAssetAddress : DUSD;

  const { data: assetTokenMeta } = useReadContracts({
    contracts: hasReadableVault
      ? [
          { address: assetToken, abi: DemoUSDABI, functionName: "symbol" },
          { address: assetToken, abi: DemoUSDABI, functionName: "decimals" },
        ]
      : [],
    query: { enabled: hasReadableVault, refetchInterval: 15_000 },
  });

  const assetSymbol = (assetTokenMeta?.[0]?.result as string) ?? "dUSD";
  const rawAssetDecimals = assetTokenMeta?.[1]?.result;
  const assetDecimals =
    typeof rawAssetDecimals === "number"
      ? rawAssetDecimals
      : Number((rawAssetDecimals as bigint | undefined) ?? 6n);

  /* ── user reads ─────────────────────────────────────── */
  const { data: userData } = useReadContracts({
    contracts:
      address && hasReadableVault
        ? [
            {
              address: assetToken,
              abi: DemoUSDABI,
              functionName: "balanceOf",
              args: [address],
            },
            {
              address: selectedVault,
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
              address: assetToken,
              abi: DemoUSDABI,
              functionName: "allowance",
              args: [address, selectedVault],
            },
          ]
        : [],
    query: { enabled: !!address && hasReadableVault, refetchInterval: 6_000 },
  });

  const assetBal = (userData?.[0]?.result as bigint) ?? 0n;
  const sharesBal = (userData?.[1]?.result as bigint) ?? 0n;
  const isApproved = (userData?.[2]?.result as boolean) ?? false;
  const allowance = (userData?.[3]?.result as bigint) ?? 0n;

  const totalAssetsUi = Number(formatUnits(totalAssets, assetDecimals));
  const totalSupplyUi = Number(formatUnits(totalSupply, vaultDecimals));
  const sharePrice = totalSupplyUi > 0 ? (totalAssetsUi / totalSupplyUi).toFixed(4) : "1.0000";

  const isMintHelperAvailable = assetToken.toLowerCase() === DUSD.toLowerCase();

  const loadRequest = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const id = Number(requestInput);
      if (!Number.isInteger(id) || id <= 0) return;
      setSelection({ kind: "request", requestId: id });
    },
    [requestInput]
  );

  const loadAsset = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const normalized = assetInput.trim();
      if (!isBytes32(normalized) || normalized.toLowerCase() === ZERO_BYTES32) return;
      setSelection({ kind: "asset", assetId: normalized as `0x${string}` });
    },
    [assetInput]
  );

  const quickSelectedAssetId =
    selection?.kind === "asset" && selection.assetId ? selection.assetId : "";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Asset Vault</h1>
        <p className="text-sm text-muted mt-1">
          Select by requestId or assetId, then interact with its ERC-4626 vault
        </p>
      </div>

      <Card>
        <CardTitle>Select Vault Target</CardTitle>
        <div className="grid md:grid-cols-2 gap-3">
          <form onSubmit={loadRequest} className="space-y-2">
            <label className="block text-xs text-muted">Load by requestId</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={requestInput}
                onChange={(e) => setRequestInput(e.target.value)}
                placeholder="e.g. 1"
                className="flex-1 font-mono"
              />
              <Button type="submit" disabled={!requestInput || Number(requestInput) <= 0}>
                Load
              </Button>
            </div>
          </form>

          <form onSubmit={loadAsset} className="space-y-2">
            <label className="block text-xs text-muted">Load by assetId (bytes32)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={assetInput}
                onChange={(e) => setAssetInput(e.target.value)}
                placeholder="0x... (64 hex chars)"
                className="flex-1 font-mono"
              />
              <Button type="submit" disabled={!isBytes32(assetInput.trim())}>
                Load
              </Button>
            </div>
          </form>
        </div>

        {discoveredAssetOptions.length > 0 && (
          <div className="mt-3 space-y-2">
            <label className="block text-xs text-muted">Quick select discovered assets</label>
            <select
              value={quickSelectedAssetId}
              onChange={(e) => {
                const selected = e.target.value.trim();
                if (!isBytes32(selected)) return;
                setAssetInput(selected);
                setSelection({ kind: "asset", assetId: selected as `0x${string}` });
              }}
              className="w-full font-mono"
            >
              <option value="">Select an asset…</option>
              {discoveredAssetOptions.map((option) => (
                <option key={`${option.requestId}-${option.assetId}`} value={option.assetId}>
                  {`#${option.requestId} · ${shortHex(option.assetId)} · ${
                    option.vault ? "vault ready" : "vault pending"
                  }${option.subject ? ` · ${shortHex(option.subject, 8, 6)}` : ""}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 text-xs grid md:grid-cols-2 gap-2">
          <div>
            <span className="text-muted mr-1">Active selector:</span>
            {selection ? (
              <Badge variant="accent">
                {selection.kind === "request"
                  ? `request #${selection.requestId}`
                  : `asset ${selection.assetId.slice(0, 10)}...${selection.assetId.slice(-8)}`}
              </Badge>
            ) : (
              <span className="text-zinc-500">none</span>
            )}
          </div>
          <div>
            <span className="text-muted mr-1">Resolved assetId:</span>
            {resolvedAssetId ? (
              <code className="font-mono text-zinc-300" title={resolvedAssetId}>
                {resolvedAssetId.slice(0, 12)}...{resolvedAssetId.slice(-10)}
              </code>
            ) : (
              <span className="text-zinc-500">--</span>
            )}
          </div>
          <div>
            <span className="text-muted mr-1">Resolved vault:</span>
            {hasResolvedVault ? <AddressLink address={selectedVault} chars={8} /> : <span className="text-zinc-500">not found</span>}
          </div>
          <div>
            <span className="text-muted mr-1">Mode:</span>
            <span className="text-zinc-300">{hasPerAssetLookup ? "per-asset" : "legacy single-vault"}</span>
          </div>
        </div>
      </Card>

      {!hasResolvedVault && hasPerAssetLookup && (
        <Card className="border-warning/30">
          <p className="text-sm text-warning">
            No vault found for this request/asset yet. Approve the request and run the CRE workflow with auto-create vaults enabled.
          </p>
        </Card>
      )}

      {hasResolvedVault && vaultLoading && (
        <Card className="border-accent/30">
          <p className="text-sm text-accent">Reading selected vault on-chain…</p>
        </Card>
      )}

      {hasResolvedVault && !vaultLoading && !hasReadableVault && (
        <Card className="border-danger/30">
          <p className="text-sm text-danger">
            The resolved vault address is not readable on this network. Switch MetaMask to the correct chain and verify deployment addresses.
          </p>
        </Card>
      )}

      {!hasResolvedVault && !hasPerAssetLookup && (
        <Card className="border-accent/30">
          <p className="text-sm text-accent">
            Asset registry/factory are not configured for this network. Using legacy single vault fallback.
          </p>
        </Card>
      )}

      {hasReadableVault && (
        <>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">{vaultName}</h2>
            <p className="text-sm text-muted mt-1">ERC-4626 compliance-gated vault · {vaultSymbol}</p>
            {request && (
              <p className="text-xs text-muted mt-2 font-mono">
                subject {request.subject} · metadata {request.metadataUri}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="!p-4">
              <Stat label={`Total ${assetSymbol}`} value={formatUnits(totalAssets, assetDecimals)} />
            </Card>
            <Card className="!p-4">
              <Stat label={`Total ${vaultSymbol}`} value={formatUnits(totalSupply, vaultDecimals)} />
            </Card>
            <Card className="!p-4">
              <Stat label="Share Price" value={sharePrice} />
            </Card>
            <Card className="!p-4">
              <Stat label="Underlying" value={<AddressLink address={assetToken} chars={5} />} />
            </Card>
          </div>

          {!isConnected && (
            <Card className="border-accent/30">
              <p className="text-sm text-accent">Connect your wallet to interact with the selected vault.</p>
            </Card>
          )}

          {isConnected && (
            <>
              <Card>
                <CardTitle>Your Position</CardTitle>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label={`${assetSymbol} Balance`} value={formatUnits(assetBal, assetDecimals)} />
                  <Stat label={`Your ${vaultSymbol}`} value={formatUnits(sharesBal, vaultDecimals)} />
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
                    Your address is not compliant. Deposits and withdrawals are blocked until the CRE workflow approves you.
                  </p>
                </Card>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {isMintHelperAvailable && (
                  <MintTokenCard tokenAddress={assetToken} tokenSymbol={assetSymbol} tokenDecimals={assetDecimals} />
                )}
                <ApproveCard
                  tokenAddress={assetToken}
                  tokenSymbol={assetSymbol}
                  tokenDecimals={assetDecimals}
                  vaultAddress={selectedVault}
                  allowance={allowance}
                />
                <DepositCard
                  vaultAddress={selectedVault}
                  tokenSymbol={assetSymbol}
                  tokenDecimals={assetDecimals}
                  vaultSymbol={vaultSymbol}
                  vaultDecimals={vaultDecimals}
                  assetBal={assetBal}
                  allowance={allowance}
                  isApproved={isApproved}
                />
                <WithdrawCard
                  vaultAddress={selectedVault}
                  tokenSymbol={assetSymbol}
                  tokenDecimals={assetDecimals}
                  vaultDecimals={vaultDecimals}
                  sharesBal={sharesBal}
                  isApproved={isApproved}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function MintTokenCard({
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
}: {
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
}) {
  const { address } = useAccount();
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleMint = useCallback(() => {
    const parsed = safeParse(amt, tokenDecimals);
    if (!parsed || !address) return;
    reset();
    writeContract({
      address: tokenAddress,
      abi: DemoUSDABI,
      functionName: "mint",
      args: [address, parsed],
    });
  }, [amt, tokenAddress, tokenDecimals, address, writeContract, reset]);

  return (
    <Card>
      <CardTitle>Mint {tokenSymbol}</CardTitle>
      <p className="text-xs text-muted mb-3">Owner-only test helper</p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          value={amt}
          onChange={(e) => {
            setAmt(e.target.value);
            if (error) reset();
          }}
          className="flex-1 font-mono"
        />
        <Button disabled={isPending || confirming || !safeParse(amt, tokenDecimals)} onClick={handleMint}>
          {confirming ? "Confirming…" : isPending ? "Signing…" : "Mint"}
        </Button>
      </div>
      {isSuccess && hash && (
        <p className="text-xs text-success mt-2">
          ✓ Minted {amt} {tokenSymbol} —{" "}
          <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            View TX ↗
          </a>
        </p>
      )}
      {error && <p className="text-xs text-danger mt-2 break-all">{(error as any).shortMessage || error.message}</p>}
    </Card>
  );
}

function ApproveCard({
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  vaultAddress,
  allowance,
}: {
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  vaultAddress: `0x${string}`;
  allowance: bigint;
}) {
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleApprove = useCallback(() => {
    const parsed = safeParse(amt, tokenDecimals);
    if (!parsed) return;
    reset();
    writeContract({
      address: tokenAddress,
      abi: DemoUSDABI,
      functionName: "approve",
      args: [vaultAddress, parsed],
    });
  }, [amt, tokenAddress, tokenDecimals, vaultAddress, writeContract, reset]);

  return (
    <Card>
      <CardTitle>Approve Vault</CardTitle>
      <p className="text-xs text-muted mb-3">
        Current allowance: {formatUnits(allowance, tokenDecimals)} {tokenSymbol}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          value={amt}
          onChange={(e) => {
            setAmt(e.target.value);
            if (error) reset();
          }}
          className="flex-1 font-mono"
        />
        <Button disabled={isPending || confirming || !safeParse(amt, tokenDecimals)} onClick={handleApprove}>
          {confirming ? "Confirming…" : isPending ? "Signing…" : "Approve"}
        </Button>
      </div>
      {isSuccess && hash && (
        <p className="text-xs text-success mt-2">
          ✓ Approved {amt} {tokenSymbol} for vault —{" "}
          <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            View TX ↗
          </a>
        </p>
      )}
      {error && <p className="text-xs text-danger mt-2 break-all">{(error as any).shortMessage || error.message}</p>}
    </Card>
  );
}

function DepositCard({
  vaultAddress,
  tokenSymbol,
  tokenDecimals,
  vaultSymbol,
  vaultDecimals,
  assetBal,
  allowance,
  isApproved,
}: {
  vaultAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  vaultSymbol: string;
  vaultDecimals: number;
  assetBal: bigint;
  allowance: bigint;
  isApproved: boolean;
}) {
  const { address } = useAccount();
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const parsed = safeParse(amt, tokenDecimals);
  const { data: maxDepositData } = useReadContract({
    address: vaultAddress,
    abi: RWAVaultABI,
    functionName: "maxDeposit",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const walletMax = allowance < assetBal ? allowance : assetBal;
  const protocolMax = typeof maxDepositData === "bigint" ? maxDepositData : walletMax;
  const maxDeposit = protocolMax < walletMax ? protocolMax : walletMax;
  const { data: previewSharesData } = useReadContract({
    address: vaultAddress,
    abi: RWAVaultABI,
    functionName: "convertToShares",
    args: parsed && parsed > 0n ? [parsed] : undefined,
    query: { enabled: !!parsed && parsed > 0n },
  });
  const previewShares = (previewSharesData as bigint) ?? 0n;

  const exceedsAllowance = parsed !== null && parsed > allowance;
  const exceedsBalance = parsed !== null && parsed > assetBal;
  const exceedsMaxDeposit = parsed !== null && parsed > maxDeposit;

  const handleDeposit = useCallback(() => {
    if (!parsed || !address) return;
    reset();
    writeContract({
      address: vaultAddress,
      abi: RWAVaultABI,
      functionName: "deposit",
      args: [parsed, address],
    });
  }, [parsed, address, vaultAddress, writeContract, reset]);

  return (
    <Card>
      <CardTitle>Deposit {tokenSymbol} → {vaultSymbol}</CardTitle>
      <p className="text-xs text-muted mb-1">Receive {vaultSymbol} vault shares (compliance-gated)</p>
      <p className="text-xs text-muted mb-3">
        Max now: {formatUnits(maxDeposit, tokenDecimals)} {tokenSymbol} (wallet: {formatUnits(assetBal, tokenDecimals)}, allowance: {formatUnits(allowance, tokenDecimals)})
      </p>
      <p className="text-xs text-muted mb-3">
        Vault: <AddressLink address={vaultAddress} chars={6} />
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          value={amt}
          onChange={(e) => {
            setAmt(e.target.value);
            if (error) reset();
          }}
          className="flex-1 font-mono"
        />
        <button
          type="button"
          onClick={() => setAmt(formatUnits(maxDeposit, tokenDecimals))}
          className="text-[10px] text-accent hover:text-accent/80 px-1"
        >
          MAX
        </button>
        <Button
          disabled={
            isPending ||
            confirming ||
            !parsed ||
            parsed === 0n ||
            exceedsBalance ||
            exceedsAllowance ||
            exceedsMaxDeposit ||
            !isApproved
          }
          onClick={handleDeposit}
        >
          {confirming ? "Confirming…" : isPending ? "Signing…" : "Deposit"}
        </Button>
      </div>
      {parsed && parsed > 0n && (
        <p className="text-xs text-muted mt-2">
          Estimated shares: {formatUnits(previewShares, vaultDecimals)} {vaultSymbol}
        </p>
      )}
      {!isApproved && <p className="text-xs text-warning mt-2">⚠ Compliance not approved — run CRE workflow first</p>}
      {exceedsAllowance && !exceedsBalance && (
        <p className="text-xs text-warning mt-2">⚠ Exceeds vault allowance — approve more {tokenSymbol} first</p>
      )}
      {exceedsBalance && <p className="text-xs text-warning mt-2">⚠ Exceeds your {tokenSymbol} balance</p>}
      {exceedsMaxDeposit && (
        <p className="text-xs text-warning mt-2">⚠ Exceeds max deposit for your address in this vault</p>
      )}
      {isSuccess && hash && (
        <p className="text-xs text-success mt-2">
          ✓ Deposited {amt} {tokenSymbol} into vault —{" "}
          <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            View TX ↗
          </a>
        </p>
      )}
      {error && <p className="text-xs text-danger mt-2 break-all">{(error as any).shortMessage || error.message}</p>}
    </Card>
  );
}

function WithdrawCard({
  vaultAddress,
  tokenSymbol,
  tokenDecimals,
  vaultDecimals,
  sharesBal,
  isApproved,
}: {
  vaultAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  vaultDecimals: number;
  sharesBal: bigint;
  isApproved: boolean;
}) {
  const { address } = useAccount();
  const [amt, setAmt] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { data: maxWithdrawData } = useReadContract({
    address: vaultAddress,
    abi: RWAVaultABI,
    functionName: "convertToAssets",
    args: [sharesBal],
    query: { enabled: sharesBal > 0n },
  });

  const maxWithdrawAssets = (maxWithdrawData as bigint) ?? 0n;
  const parsed = safeParse(amt, tokenDecimals);

  const handleWithdraw = useCallback(() => {
    if (!parsed || !address) return;
    reset();
    writeContract({
      address: vaultAddress,
      abi: RWAVaultABI,
      functionName: "withdraw",
      args: [parsed, address, address],
    });
  }, [parsed, address, vaultAddress, writeContract, reset]);

  return (
    <Card>
      <CardTitle>Withdraw</CardTitle>
      <p className="text-xs text-muted mb-1">Burn shares, receive {tokenSymbol}</p>
      <p className="text-xs text-muted mb-1">Your shares: {formatUnits(sharesBal, vaultDecimals)}</p>
      <p className="text-xs text-muted mb-3">Max withdraw: {formatUnits(maxWithdrawAssets, tokenDecimals)} {tokenSymbol}</p>

      {sharesBal === 0n ? (
        <p className="text-xs text-warning">
          You have 0 vault shares. Deposit {tokenSymbol} first to receive shares, then withdraw.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder={`Amount (${tokenSymbol})`}
              value={amt}
              onChange={(e) => {
                setAmt(e.target.value);
                if (error) reset();
              }}
              className="flex-1 font-mono"
            />
            <button
              type="button"
              onClick={() => setAmt(formatUnits(maxWithdrawAssets, tokenDecimals))}
              className="text-[10px] text-accent hover:text-accent/80 px-1"
            >
              MAX
            </button>
            <Button disabled={isPending || confirming || !parsed || parsed === 0n || !isApproved} onClick={handleWithdraw}>
              {confirming ? "Confirming…" : isPending ? "Signing…" : "Withdraw"}
            </Button>
          </div>
          {!isApproved && (
            <p className="text-xs text-warning mt-2">⚠ Compliance not approved — withdrawals are blocked</p>
          )}
          {isSuccess && hash && (
            <p className="text-xs text-success mt-2">
              ✓ Withdrawn {amt} {tokenSymbol} from vault —{" "}
              <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                View TX ↗
              </a>
            </p>
          )}
          {error && <p className="text-xs text-danger mt-2 break-all">{(error as any).shortMessage || error.message}</p>}
        </>
      )}
    </Card>
  );
}
