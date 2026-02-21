"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES } from "@/lib/addresses";
import {
  DiligencePortalABI,
  ComplianceRegistryABI,
  RWAVaultABI,
  RWAComplianceReceiverABI,
} from "@/lib/abis";
import { Card, CardTitle, Stat, Badge, StatusDot, AddressLink } from "@/components/ui";
import { formatUnits } from "@/lib/utils";
import { IS_LOCAL } from "@/lib/network";
import Link from "next/link";

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

  const totalRequests = nextRequestId ? Number(nextRequestId) - 1 : 0;
  const protocolAgentIds = [repAgentId, valAgentId]
    .filter((id): id is bigint => typeof id === "bigint" && id > 0n)
    .map((id) => id.toString());
  const totalAgents = new Set(protocolAgentIds).size;
  const tvl = vaultTotalAssets ? formatUnits(vaultTotalAssets as bigint, 6) : "0";
  const shares = vaultTotalSupply ? formatUnits(vaultTotalSupply as bigint, 6) : "0";

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
          <Stat label="Vault TVL (dUSD)" value={tvl} accent="success" />
        </Card>
        <Card>
          <Stat label="Vault Shares" value={shares} />
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
