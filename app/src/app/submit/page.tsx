"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { keccak256, toHex } from "viem";
import { ADDRESSES } from "@/lib/addresses";
import { DiligencePortalABI } from "@/lib/abis";
import { Card, CardTitle, Button, Badge, AddressLink, TxLink } from "@/components/ui";
import { anvilBaseSepolia } from "@/lib/wagmi";
import { BLOCK_EXPLORER } from "@/lib/network";
import { txUrl, addressUrl, truncAddr } from "@/lib/utils";
import Link from "next/link";

export default function SubmitPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();

  const [subject, setSubject] = useState(address || "");
  const [metadataUri, setMetadataUri] = useState(
    "https://silver-genuine-aardvark-194.mypinata.cloud/ipfs/bafkreihabnpymvxs54yibq6zak5q7xjrwjckr2exuedpzr4esqxeuvehhi"
  );
  const [docBundleHash, setDocBundleHash] = useState(
    "0x023885a086cc9fd46bf6bf0a17c95058c1f266f8e9bf4b0684c0b140b8ad3ef6"
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
  const wrongChain = chainId !== anvilBaseSepolia.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !docBundleHash) return;
    if (wrongChain) {
      await switchChainAsync({ chainId: anvilBaseSepolia.id });
      return;
    }

    writeContract({
      address: ADDRESSES.DiligencePortal as `0x${string}`,
      abi: DiligencePortalABI,
      functionName: "submit",
      args: [subject as `0x${string}`, docBundleHash as `0x${string}`, metadataUri],
      chainId: anvilBaseSepolia.id,
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
              placeholder="ipfs://... or https://..."
              className="w-full"
            />
            <p className="text-[11px] text-muted mt-1">
              Pre-filled: Acme Renewables Ltd company bundle on Pinata IPFS
            </p>
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
              <Button type="button" variant="secondary" onClick={computeHash}>
                Hash URI
              </Button>
            </div>
            <p className="text-[11px] text-muted mt-1">
              keccak256 of the raw document bytes — pre-filled for the Acme bundle
            </p>
          </div>

          <div className="pt-2">
            {!isConnected ? (
              <p className="text-sm text-warning">Connect wallet to submit</p>
            ) : (
              <Button
                type="submit"
                disabled={isWriting || isConfirming || isSwitchingChain}
              >
                {isSwitchingChain
                  ? "Switching network..."
                  : isWriting
                  ? "Confirm in wallet..."
                  : isConfirming
                  ? "Mining..."
                  : wrongChain
                  ? `Switch to ${anvilBaseSepolia.id}`
                  : "Submit Request"}
              </Button>
            )}
          </div>

          {isConnected && wrongChain && (
            <div className="p-3 rounded-md bg-warning/10 text-warning text-xs">
              Wallet is on chain {chainId}. Switch to {anvilBaseSepolia.name} ({anvilBaseSepolia.id}) before submit.
            </div>
          )}

          {writeError && (
            <div className="p-3 rounded-md bg-danger/10 text-danger text-xs font-mono break-all">
              {writeError.message}
            </div>
          )}

          {isConfirmed && txHash && (
            <div className="p-4 rounded-md bg-success/10 border border-success/20 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="success">Confirmed</Badge>
                <span className="text-sm text-zinc-300">
                  Request submitted successfully
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">TX:</span>
                <a
                  href={txUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-accent hover:underline break-all inline-flex items-center gap-1"
                >
                  {txHash}
                  <span className="text-[10px]">↗</span>
                </a>
              </div>
              <div className="pt-1 border-t border-success/10">
                <p className="text-xs text-zinc-400 mb-2">
                  Request is on-chain. Now run the CRE workflow to process it:
                </p>
                <Link
                  href={`/process?id=${nextRequestId ? Number(nextRequestId) - 1 : ""}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
                >
                  ▶ Process with CRE Workflow →
                </Link>
              </div>
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
        <AddressLink address={req.subject || ""} chars={6} />
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
