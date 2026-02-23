"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES } from "@/lib/addresses";
import {
  DiligencePortalABI,
  ComplianceRegistryABI,
  RWAVaultABI,
  RWAVaultFactoryABI,
  RWAComplianceReceiverABI,
} from "@/lib/abis";
import { Card, CardTitle, Stat, Badge, StatusDot, AddressLink } from "@/components/ui";
import { formatUnits } from "@/lib/utils";
import { IS_LOCAL } from "@/lib/network";
import Link from "next/link";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

export default function Dashboard() {
  const { data: nextRequestId } = useReadContract({
    address: ADDRESSES.DiligencePortal as `0x${string}`,
    abi: DiligencePortalABI,
    functionName: "nextRequestId",
  });

  const { data: vaultTotalAssets } = useReadContract({
    address: ADDRESSES.RWAVault as `0x${string}`,
    abi: RWAVaultABI,
    functionName: "totalAssets",
  });

  const { data: vaultTotalSupply } = useReadContract({
    address: ADDRESSES.RWAVault as `0x${string}`,
    abi: RWAVaultABI,
    functionName: "totalSupply",
  });

  const { data: registryOwner } = useReadContract({
    address: ADDRESSES.ComplianceRegistry as `0x${string}`,
    abi: ComplianceRegistryABI,
    functionName: "owner",
  });

  const { data: workflowOperator } = useReadContract({
    address: ADDRESSES.ComplianceRegistry as `0x${string}`,
    abi: ComplianceRegistryABI,
    functionName: "workflowOperator",
  });

  const { data: receiverForwarder } = useReadContract({
    address: ADDRESSES.RWAComplianceReceiver as `0x${string}`,
    abi: RWAComplianceReceiverABI,
    functionName: "forwarder",
  });

  const { data: repAgentId } = useReadContract({
    address: ADDRESSES.RWAComplianceReceiver as `0x${string}`,
    abi: RWAComplianceReceiverABI,
    functionName: "reputationAgentId",
  });

  const { data: valAgentId } = useReadContract({
    address: ADDRESSES.RWAComplianceReceiver as `0x${string}`,
    abi: RWAComplianceReceiverABI,
    functionName: "validationAgentId",
  });

  const { data: receiverAssetRegistry } = useReadContract({
    address: ADDRESSES.RWAComplianceReceiver as `0x${string}`,
    abi: RWAComplianceReceiverABI,
    functionName: "rwaAssetRegistry",
  });

  const { data: receiverVaultFactory } = useReadContract({
    address: ADDRESSES.RWAComplianceReceiver as `0x${string}`,
    abi: RWAComplianceReceiverABI,
    functionName: "rwaVaultFactory",
  });

  const { data: autoCreateRwaVaults } = useReadContract({
    address: ADDRESSES.RWAComplianceReceiver as `0x${string}`,
    abi: RWAComplianceReceiverABI,
    functionName: "autoCreateRwaVaults",
  });

  const totalRequests = nextRequestId ? Number(nextRequestId) - 1 : 0;

  const hasPerAssetFactory =
    (ADDRESSES.RWAVaultFactory || "").toLowerCase() !== ZERO_ADDRESS.toLowerCase();

  const requestIds = useMemo(
    () => Array.from({ length: Math.max(0, totalRequests) }, (_, idx) => BigInt(idx + 1)),
    [totalRequests]
  );

  const { data: assetIdRows } = useReadContracts({
    contracts: hasPerAssetFactory
      ? requestIds.map((requestId) => ({
          address: ADDRESSES.DiligencePortal as `0x${string}`,
          abi: DiligencePortalABI,
          functionName: "assetIdForRequest",
          args: [requestId],
        }))
      : [],
    query: { enabled: hasPerAssetFactory && requestIds.length > 0, refetchInterval: 8_000 },
  });

  const uniqueAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of assetIdRows ?? []) {
      const assetId = row?.result as string | undefined;
      if (!assetId || !/^0x[0-9a-fA-F]{64}$/.test(assetId)) continue;
      if (assetId.toLowerCase() === ZERO_BYTES32) continue;
      ids.add(assetId.toLowerCase());
    }
    return Array.from(ids) as `0x${string}`[];
  }, [assetIdRows]);

  const { data: vaultLookupRows } = useReadContracts({
    contracts: hasPerAssetFactory
      ? uniqueAssetIds.map((assetId) => ({
          address: ADDRESSES.RWAVaultFactory as `0x${string}`,
          abi: RWAVaultFactoryABI,
          functionName: "vaultByAssetId",
          args: [assetId],
        }))
      : [],
    query: { enabled: hasPerAssetFactory && uniqueAssetIds.length > 0, refetchInterval: 8_000 },
  });

  const uniqueVaultAddresses = useMemo(() => {
    const vaults = new Set<string>();
    for (const row of vaultLookupRows ?? []) {
      const vault = row?.result as string | undefined;
      if (!vault || !/^0x[0-9a-fA-F]{40}$/.test(vault)) continue;
      if (vault.toLowerCase() === ZERO_ADDRESS.toLowerCase()) continue;
      vaults.add(vault.toLowerCase());
    }
    return Array.from(vaults) as `0x${string}`[];
  }, [vaultLookupRows]);

  const { data: perVaultRows } = useReadContracts({
    contracts: uniqueVaultAddresses.flatMap((vault) => [
      { address: vault, abi: RWAVaultABI, functionName: "totalAssets" as const },
      { address: vault, abi: RWAVaultABI, functionName: "totalSupply" as const },
    ]),
    query: { enabled: uniqueVaultAddresses.length > 0, refetchInterval: 8_000 },
  });

  const { perAssetTotalAssets, perAssetTotalShares } = useMemo(() => {
    let assets = 0n;
    let shares = 0n;
    const rows = perVaultRows ?? [];
    for (let idx = 0; idx < rows.length; idx += 2) {
      const assetsVal = rows[idx]?.result as bigint | undefined;
      const sharesVal = rows[idx + 1]?.result as bigint | undefined;
      if (typeof assetsVal === "bigint") assets += assetsVal;
      if (typeof sharesVal === "bigint") shares += sharesVal;
    }
    return { perAssetTotalAssets: assets, perAssetTotalShares: shares };
  }, [perVaultRows]);

  const hasPerAssetAggregation = uniqueVaultAddresses.length > 0;
  const effectiveTotalAssets = hasPerAssetAggregation
    ? perAssetTotalAssets
    : ((vaultTotalAssets as bigint) ?? 0n);
  const effectiveTotalShares = hasPerAssetAggregation
    ? perAssetTotalShares
    : ((vaultTotalSupply as bigint) ?? 0n);

  const protocolAgentIds = [repAgentId, valAgentId]
    .filter((id): id is bigint => typeof id === "bigint" && id > 0n)
    .map((id) => id.toString());
  const totalAgents = new Set(protocolAgentIds).size;
  const tvl = formatUnits(effectiveTotalAssets, 6);
  const shares = formatUnits(effectiveTotalShares, 6);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Protocol Dashboard</h1>
          <Badge variant={IS_LOCAL ? "warning" : "accent"}>
            {IS_LOCAL ? "⚙ Local (Anvil)" : "🌐 Base Sepolia"}
          </Badge>
        </div>
        <p className="text-sm text-muted mt-1">
          DeepSeal — live on-chain state
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <Stat label="Diligence Requests" value={totalRequests.toString()} accent="accent" />
        </Card>
        <Card>
          <Stat
            label={hasPerAssetAggregation ? "Vault TVL (All Assets)" : "Vault TVL (dUSD)"}
            value={tvl}
            accent="success"
          />
        </Card>
        <Card>
          <Stat
            label={hasPerAssetAggregation ? "Vault Shares (All Assets)" : "Vault Shares"}
            value={shares}
          />
        </Card>
        <Card>
          <Stat label="ERC-8004 Agents" value={totalAgents.toString()} accent="warning" />
        </Card>
      </div>

      {/* Protocol Contracts */}
      <Card>
        <CardTitle>Deployed Contracts</CardTitle>
        <div className="space-y-2">
          {Object.entries(ADDRESSES).map(([name, addr]) => (
            <div key={name} className="flex items-center justify-between py-1.5 border-b border-surface-3 last:border-0">
              <span className="text-sm text-zinc-300">{name}</span>
              <AddressLink address={addr} chars={8} />
            </div>
          ))}
        </div>
      </Card>

      {/* System State */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Compliance Registry</CardTitle>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Owner</span>
              <AddressLink address={(registryOwner as string) || ""} chars={6} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Workflow Operator</span>
              <AddressLink address={(workflowOperator as string) || ""} chars={6} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Operator = Receiver?</span>
              <Badge variant={
                workflowOperator && (workflowOperator as string).toLowerCase() === ADDRESSES.RWAComplianceReceiver.toLowerCase()
                  ? "success" : "danger"
              }>
                {workflowOperator && (workflowOperator as string).toLowerCase() === ADDRESSES.RWAComplianceReceiver.toLowerCase()
                  ? "Yes" : "No"}
              </Badge>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>CRE Receiver</CardTitle>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Forwarder</span>
              <div className="flex items-center gap-2">
                <StatusDot active={receiverForwarder !== "0x0000000000000000000000000000000000000000"} />
                {receiverForwarder === "0x0000000000000000000000000000000000000000"
                  ? <span className="text-xs text-zinc-300">Open (anyone)</span>
                  : <AddressLink address={(receiverForwarder as string) || ""} chars={6} />}
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Reputation Agent</span>
              <code className="font-mono text-xs text-accent">#{repAgentId?.toString()}</code>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Validation Agent</span>
              <code className="font-mono text-xs text-accent">#{valAgentId?.toString()}</code>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Asset Registry</span>
              <AddressLink address={(receiverAssetRegistry as string) || ""} chars={6} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Vault Factory</span>
              <AddressLink address={(receiverVaultFactory as string) || ""} chars={6} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Auto-create per-asset vaults</span>
              <Badge variant={autoCreateRwaVaults ? "success" : "warning"}>
                {autoCreateRwaVaults ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link
          href="/submit"
          className="px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90"
        >
          Submit Request
        </Link>
        <Link
          href="/compliance"
          className="px-4 py-2 rounded-md text-sm font-medium bg-surface-3 text-zinc-300 hover:bg-surface-4"
        >
          Check Compliance
        </Link>
        <Link
          href="/vault"
          className="px-4 py-2 rounded-md text-sm font-medium bg-surface-3 text-zinc-300 hover:bg-surface-4"
        >
          Manage Vault
        </Link>
      </div>
    </div>
  );
}
