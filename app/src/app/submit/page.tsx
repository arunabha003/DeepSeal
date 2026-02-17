"use client";

import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { keccak256, toHex, encodePacked } from "viem";
import { ADDRESSES } from "@/lib/addresses";
import { DiligencePortalABI } from "@/lib/abis";
import { Card, CardTitle, Button, Badge } from "@/components/ui";

export default function SubmitPage() {
  const { address, isConnected } = useAccount();

  const [subject, setSubject] = useState(address || "");
  const [metadataUri, setMetadataUri] = useState("ipfs://rwa-docs/acme");
  const [docBundleHash, setDocBundleHash] = useState(
    "0x1111111111111111111111111111111111111111111111111111111111111111"
  );

  const { data: nextRequestId } = useReadContract({
    address: ADDRESSES.DiligencePortal as `0x${string}`,
    abi: DiligencePortalABI,
    functionName: "nextRequestId",
  });

  const {
    writeContract,
    data: txHash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !docBundleHash) return;

    writeContract({
      address: ADDRESSES.DiligencePortal as `0x${string}`,
      abi: DiligencePortalABI,
      functionName: "submit",
      args: [subject as `0x${string}`, docBundleHash as `0x${string}`, metadataUri],
    });
  };

  const computeHash = () => {
    const hash = keccak256(toHex(metadataUri || ""));
    setDocBundleHash(hash);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Submit Diligence Request
        </h1>
        <p className="text-sm text-muted mt-1">
          Create an on-chain request for RWA due-diligence via DiligencePortal
        </p>
      </div>

      <Card>
        <CardTitle>Next Request ID</CardTitle>
        <p className="text-2xl font-mono font-bold text-accent">
          #{nextRequestId?.toString() || "--"}
        </p>
      </Card>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Subject Address
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="0x..."
              className="w-full font-mono"
            />
            <p className="text-[11px] text-muted mt-1">
              The address being evaluated for compliance
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Metadata URI
            </label>
            <input
              type="text"
              value={metadataUri}
              onChange={(e) => setMetadataUri(e.target.value)}
              placeholder="ipfs://..."
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Document Bundle Hash
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={docBundleHash}
                onChange={(e) => setDocBundleHash(e.target.value)}
                placeholder="0x..."
                className="flex-1 font-mono text-xs"
              />
              <Button variant="secondary" onClick={computeHash}>
                Hash URI
              </Button>
            </div>
          </div>

          <div className="pt-2">
            {!isConnected ? (
              <p className="text-sm text-warning">Connect wallet to submit</p>
            ) : (
              <Button
                type="submit"
                disabled={isWriting || isConfirming}
              >
                {isWriting
                  ? "Confirm in wallet..."
                  : isConfirming
                  ? "Mining..."
                  : "Submit Request"}
              </Button>
            )}
          </div>

          {writeError && (
            <div className="p-3 rounded-md bg-danger/10 text-danger text-xs font-mono break-all">
              {writeError.message}
            </div>
          )}

          {isConfirmed && txHash && (
            <div className="p-4 rounded-md bg-success/10 border border-success/20 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="success">Confirmed</Badge>
                <span className="text-sm text-zinc-300">
                  Request submitted successfully
                </span>
              </div>
              <p className="text-xs font-mono text-muted break-all">
                tx: {txHash}
              </p>
            </div>
          )}
        </form>
      </Card>

      {/* Recent Requests */}
      <RequestHistory />
    </div>
  );
}

function RequestHistory() {
  const { data: nextRequestId } = useReadContract({
    address: ADDRESSES.DiligencePortal as `0x${string}`,
    abi: DiligencePortalABI,
    functionName: "nextRequestId",
  });

  const total = nextRequestId ? Number(nextRequestId) - 1 : 0;
  const ids = Array.from({ length: Math.min(total, 10) }, (_, i) => total - i);

  if (ids.length === 0) return null;

  return (
    <Card>
      <CardTitle>Recent Requests</CardTitle>
      <div className="space-y-0">
        {ids.map((id) => (
          <RequestRow key={id} requestId={id} />
        ))}
      </div>
    </Card>
  );
}

function RequestRow({ requestId }: { requestId: number }) {
  const { data } = useReadContract({
    address: ADDRESSES.DiligencePortal as `0x${string}`,
    abi: DiligencePortalABI,
    functionName: "getRequest",
    args: [BigInt(requestId)],
  });

  const req = data as
    | {
        requester: string;
        subject: string;
        docBundleHash: string;
        metadataUri: string;
        requestedAt: bigint;
      }
    | undefined;

  if (!req) return null;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-surface-3 last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-accent">#{requestId}</span>
        <code className="text-xs font-mono text-zinc-400">
          {req.subject?.slice(0, 10)}...{req.subject?.slice(-6)}
        </code>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">{req.metadataUri}</span>
        <span className="text-[11px] font-mono text-muted">
          {new Date(Number(req.requestedAt) * 1000).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
