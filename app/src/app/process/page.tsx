"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useReadContract } from "wagmi";
import { ADDRESSES } from "@/lib/addresses";
import { DiligencePortalABI, RWAAssetRegistryABI } from "@/lib/abis";
import { Card, CardTitle, Button, AddressLink } from "@/components/ui";
import { WorkflowMonitor } from "@/components/workflow-monitor";
import Link from "next/link";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const truncateMiddle = (value: string, start = 16, end = 12) => {
  if (!value || value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
};

function ProcessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialId = searchParams.get("id") || "";
  const [requestId, setRequestId] = useState(initialId);
  const [activeId, setActiveId] = useState(initialId ? Number(initialId) : 0);

  /* read the request from chain to show summary */
  const { data: requestData } = useReadContract({
    address: ADDRESSES.DiligencePortal as `0x${string}`,
    abi: DiligencePortalABI,
    functionName: "getRequest",
    args: activeId > 0 ? [BigInt(activeId)] : undefined,
    query: { enabled: activeId > 0 },
  });

  const { data: nextRequestId } = useReadContract({
    address: ADDRESSES.DiligencePortal as `0x${string}`,
    abi: DiligencePortalABI,
    functionName: "nextRequestId",
  });

  const { data: assetIdData } = useReadContract({
    address: ADDRESSES.DiligencePortal as `0x${string}`,
    abi: DiligencePortalABI,
    functionName: "assetIdForRequest",
    args: activeId > 0 ? [BigInt(activeId)] : undefined,
    query: { enabled: activeId > 0 },
  });

  const hasAssetRegistry =
    (ADDRESSES.RWAAssetRegistry || "").toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const assetId = (assetIdData as string | undefined) || "";
  const hasAssetId = /^0x[0-9a-fA-F]{64}$/.test(assetId) && !/^0x0{64}$/i.test(assetId);

  const { data: assetRecordData } = useReadContract({
    address: ADDRESSES.RWAAssetRegistry as `0x${string}`,
    abi: RWAAssetRegistryABI,
    functionName: "getAsset",
    args: hasAssetId ? [assetId as `0x${string}`] : undefined,
    query: { enabled: hasAssetRegistry && hasAssetId },
  });

  const req = requestData as
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

  const maxId = nextRequestId ? Number(nextRequestId) - 1 : 0;

  const handleLoadRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(requestId);
    if (id > 0 && id <= maxId) {
      setActiveId(id);
      router.replace(`/process?id=${id}`, { scroll: false });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Process Request
        </h1>
        <p className="text-sm text-muted mt-1">
          Run the CRE workflow to process a diligence request — watch every step live
        </p>
      </div>

      {/* ── Select request ────────────────────────────────── */}
      <Card>
        <CardTitle>Select Request to Process</CardTitle>
        <form onSubmit={handleLoadRequest} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-muted mb-1.5">Request ID</label>
            <input
              type="number"
              min={1}
              max={maxId || undefined}
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              placeholder={`1 – ${maxId}`}
              className="w-full font-mono"
            />
          </div>
          <Button type="submit">Load</Button>
        </form>
        {maxId > 0 && (
          <p className="text-[11px] text-muted mt-2">
            {maxId} request{maxId > 1 ? "s" : ""} submitted.{" "}
            <Link href="/submit" className="text-accent hover:underline">
              Submit a new one →
            </Link>
          </p>
        )}
      </Card>

      {/* ── Request summary ───────────────────────────────── */}
      {req && activeId > 0 && (
        <Card>
          <CardTitle>Request #{activeId} — On-Chain Data</CardTitle>
          <p className="text-[11px] text-muted mb-4">
            Resolves the document bundle, verifies the hash, extracts normalized company fields, then runs KYB and AI scoring.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-muted block mb-0.5">Subject</span>
              <AddressLink address={req.subject} chars={8} />
            </div>
            <div>
              <span className="text-muted block mb-0.5">Requester</span>
              <AddressLink address={req.requester} chars={8} />
            </div>
            <div>
              <span className="text-muted block mb-0.5">Metadata URI</span>
              <a
                href={req.metadataUri}
                target="_blank"
                rel="noopener noreferrer"
                title={req.metadataUri}
                className="font-mono text-zinc-300 hover:text-accent transition-colors flex items-center gap-1 max-w-full"
              >
                <span className="truncate min-w-0">{truncateMiddle(req.metadataUri, 34, 16)}</span>
                <span className="text-[10px]">↗</span>
              </a>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Doc Bundle Hash</span>
              <code className="font-mono text-zinc-300" title={req.docBundleHash}>
                {truncateMiddle(req.docBundleHash, 16, 12)}
              </code>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Derived Asset ID</span>
              <code className="font-mono text-zinc-300" title={assetId || ""}>
                {hasAssetId ? truncateMiddle(assetId, 16, 12) : "--"}
              </code>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Asset Registry</span>
              {!hasAssetRegistry ? (
                <span className="text-zinc-500">Not configured</span>
              ) : assetRecord?.exists ? (
                <span className="text-success font-mono">synced on-chain</span>
              ) : (
                <span className="text-zinc-500">pending workflow write</span>
              )}
            </div>
            <div>
              <span className="text-muted block mb-0.5">Per-Asset Vault</span>
              {assetRecord?.vault &&
              assetRecord.vault.toLowerCase() !== ZERO_ADDRESS.toLowerCase() ? (
                <AddressLink address={assetRecord.vault} chars={8} />
              ) : (
                <span className="text-zinc-500">not created yet</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Workflow monitor ──────────────────────────────── */}
      {activeId > 0 && req && (
        <WorkflowMonitor
          requestId={activeId}
          onComplete={() => {
            // Could auto-navigate to compliance page
          }}
        />
      )}

      {/* ── Post-run links ────────────────────────────────── */}
      {activeId > 0 && (
        <div className="flex gap-3 text-xs">
          <Link
            href="/compliance"
            className="text-accent hover:underline"
          >
            View compliance record →
          </Link>
          <Link
            href="/vault"
            className="text-accent hover:underline"
          >
            Vault operations →
          </Link>
          <Link
            href="/agents"
            className="text-accent hover:underline"
          >
            ERC-8004 agents →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ProcessPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto py-20 text-center text-muted text-sm">
          Loading...
        </div>
      }
    >
      <ProcessContent />
    </Suspense>
  );
}
