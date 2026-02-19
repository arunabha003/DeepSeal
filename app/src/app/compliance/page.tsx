"use client";

import { useState } from "react";
import { useReadContract, useAccount } from "wagmi";
import { ADDRESSES } from "@/lib/addresses";
import { ComplianceRegistryABI } from "@/lib/abis";
import { Card, CardTitle, Stat, Badge, Button, AddressLink } from "@/components/ui";
import { formatTimestamp } from "@/lib/utils";

export default function CompliancePage() {
  const { address } = useAccount();
  const [lookupAddr, setLookupAddr] = useState(address || "");
  const [queryAddr, setQueryAddr] = useState("");

  const { data: record, refetch } = useReadContract({
    address: ADDRESSES.ComplianceRegistry as `0x${string}`,
    abi: ComplianceRegistryABI,
    functionName: "getRecord",
    args: queryAddr ? [queryAddr as `0x${string}`] : undefined,
    query: { enabled: !!queryAddr },
  });

  const rec = record as
    | { approved: boolean; riskScore: number; attestationHash: string; updatedAt: bigint }
    | undefined;

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (lookupAddr) {
      setQueryAddr(lookupAddr);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Compliance Lookup
        </h1>
        <p className="text-sm text-muted mt-1">
          Query the ComplianceRegistry for any address
        </p>
      </div>

      <Card>
        <form onSubmit={handleLookup} className="flex gap-3">
          <input
            type="text"
            value={lookupAddr}
            onChange={(e) => setLookupAddr(e.target.value)}
            placeholder="Enter address to check..."
            className="flex-1 font-mono"
          />
          <Button type="submit">Lookup</Button>
        </form>
      </Card>

      {rec && queryAddr && (
        <Card>
          <CardTitle>Compliance Record</CardTitle>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Address</span>
              <AddressLink address={queryAddr} chars={8} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <Stat
                label="Status"
                value={
                  <Badge variant={rec.approved ? "success" : "danger"}>
                    {rec.approved ? "APPROVED" : "NOT APPROVED"}
                  </Badge>
                }
              />
              <Stat
                label="Risk Score"
                value={`${rec.riskScore} / 1000`}
                accent={
                  rec.riskScore === 0 && !rec.approved
                    ? undefined
                    : rec.riskScore <= 300
                    ? "success"
                    : rec.riskScore <= 700
                    ? "warning"
                    : "danger"
                }
              />
              <Stat label="Last Updated" value={formatTimestamp(rec.updatedAt)} />
              <Stat
                label="Attestation"
                value={
                  rec.attestationHash ===
                  "0x0000000000000000000000000000000000000000000000000000000000000000"
                    ? "--"
                    : `${(rec.attestationHash as string).slice(0, 14)}...`
                }
              />
            </div>

            {/* Contract details */}
            <div className="pt-2 border-t border-surface-3 space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted">Registry Contract</span>
                <AddressLink address={ADDRESSES.ComplianceRegistry} chars={6} />
              </div>
            </div>

            {rec.attestationHash !==
              "0x0000000000000000000000000000000000000000000000000000000000000000" && (
              <div className="pt-2">
                <p className="text-[11px] uppercase tracking-wider text-muted mb-1">
                  Full Attestation Hash
                </p>
                <code className="text-xs font-mono text-zinc-400 break-all block">
                  {rec.attestationHash as string}
                </code>
              </div>
            )}
          </div>
        </Card>
      )}

      {queryAddr && rec && Number(rec.updatedAt) === 0 && (
        <Card className="border-warning/30">
          <p className="text-sm text-warning">
            No compliance record found for this address. Submit a diligence request
            and run the CRE workflow to create one.
          </p>
        </Card>
      )}

      {/* Quick check for connected wallet */}
      {address && address !== queryAddr && <WalletQuickCheck address={address} />}
    </div>
  );
}

function WalletQuickCheck({ address }: { address: string }) {
  const { data: isApproved } = useReadContract({
    address: ADDRESSES.ComplianceRegistry as `0x${string}`,
    abi: ComplianceRegistryABI,
    functionName: "isApproved",
    args: [address as `0x${string}`],
  });

  return (
    <Card>
      <CardTitle>Your Wallet</CardTitle>
      <div className="flex items-center justify-between">
        <AddressLink address={address} chars={6} />
        <Badge variant={isApproved ? "success" : "default"}>
          {isApproved ? "COMPLIANT" : "NOT COMPLIANT"}
        </Badge>
      </div>
    </Card>
  );
}
