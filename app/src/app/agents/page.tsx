"use client";

import { useMemo, useState } from "react";
import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { keccak256, toHex } from "viem";
import { ADDRESSES } from "@/lib/addresses";
import {
  IdentityRegistryABI,
  ReputationRegistryABI,
  ValidationRegistryABI,
  RWAComplianceReceiverABI,
} from "@/lib/abis";
import { Card, CardTitle, Stat, Badge, Button, EmptyState } from "@/components/ui";
import { formatTimestamp, truncAddr } from "@/lib/utils";

const IDENT = ADDRESSES.IdentityRegistry as `0x${string}`;
const REP = ADDRESSES.ReputationRegistry as `0x${string}`;
const VAL = ADDRESSES.ValidationRegistry as `0x${string}`;
const RECV = ADDRESSES.RWAComplianceReceiver as `0x${string}`;

const isHex32 = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value);
const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

export default function AgentsPage() {
  const [tab, setTab] = useState<"browse" | "register" | "feedback" | "validate">("browse");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Agent Registry</h1>
        <p className="text-sm text-muted mt-1">ERC-8004 identity, reputation &amp; validation</p>
      </div>

      <div className="flex gap-1 p-1 bg-surface-1 rounded-lg w-fit">
        {(["browse", "register", "feedback", "validate"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === t ? "bg-surface-3 text-white" : "text-muted hover:text-zinc-300"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "browse" && <BrowseAgents />}
      {tab === "register" && <RegisterAgent />}
      {tab === "feedback" && <GiveFeedbackPanel />}
      {tab === "validate" && <ValidationPanel />}
    </div>
  );
}

function BrowseAgents() {
  const { data: nextId } = useReadContract({
    address: IDENT,
    abi: IdentityRegistryABI,
    functionName: "nextAgentId",
    query: { refetchInterval: 6_000 },
  });

  const { data: recvData } = useReadContracts({
    contracts: [
      { address: RECV, abi: RWAComplianceReceiverABI, functionName: "reputationAgentId" },
      { address: RECV, abi: RWAComplianceReceiverABI, functionName: "validationAgentId" },
    ],
  });

  const repAgentId = recvData?.[0]?.result as bigint | undefined;
  const valAgentId = recvData?.[1]?.result as bigint | undefined;
  const count = Number(nextId ?? 1) - 1;

  if (count <= 0) return <EmptyState message="No agents registered yet." />;

  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => {
        const id = BigInt(i + 1);
        return (
          <AgentRow
            key={i}
            agentId={id}
            isRepAgent={repAgentId !== undefined && id === repAgentId}
            isValAgent={valAgentId !== undefined && id === valAgentId}
          />
        );
      })}
    </div>
  );
}

function AgentRow({
  agentId,
  isRepAgent,
  isValAgent,
}: {
  agentId: bigint;
  isRepAgent: boolean;
  isValAgent: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: identityData } = useReadContracts({
    contracts: [
      { address: IDENT, abi: IdentityRegistryABI, functionName: "ownerOf", args: [agentId] },
      { address: IDENT, abi: IdentityRegistryABI, functionName: "tokenURI", args: [agentId] },
      { address: IDENT, abi: IdentityRegistryABI, functionName: "getAgentWallet", args: [agentId] },
    ],
  });

  const { data: validationsData } = useReadContract({
    address: VAL,
    abi: ValidationRegistryABI,
    functionName: "getAgentValidations",
    args: [agentId],
  });

  const owner = (identityData?.[0]?.result as string | undefined) ?? "";
  const uri = (identityData?.[1]?.result as string | undefined) ?? "";
  const wallet = (identityData?.[2]?.result as string | undefined) ?? "";
  const validations = (validationsData as `0x${string}`[] | undefined) ?? [];

  return (
    <Card className="cursor-pointer hover:border-zinc-600 transition-colors" onClick={() => setExpanded((v) => !v)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-surface-3 flex items-center justify-center text-xs font-mono text-accent">
            #{agentId.toString()}
          </div>
          <div>
            <p className="text-sm text-white font-medium">
              Agent {agentId.toString()}
              {isRepAgent ? (
                <Badge variant="accent" className="ml-2">
                  REP
                </Badge>
              ) : null}
              {isValAgent ? (
                <Badge variant="accent" className="ml-2">
                  VAL
                </Badge>
              ) : null}
            </p>
            <p className="text-xs text-muted font-mono">{owner ? truncAddr(owner) : "..."}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span>{validations.length} validations</span>
          <span className="text-zinc-600">{expanded ? "[-]" : "[+]"}</span>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 gap-4 text-sm">
          <Stat label="Owner" value={owner ? truncAddr(owner) : "--"} />
          <Stat label="Wallet" value={wallet ? truncAddr(wallet) : "--"} />
          <Stat label="URI" value={uri || "--"} />
          <Stat label="Validations" value={validations.length.toString()} />
        </div>
      ) : null}
    </Card>
  );
}

function RegisterAgent() {
  const [uri, setUri] = useState("");
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return (
    <Card>
      <CardTitle>Register New Agent</CardTitle>
      <p className="text-xs text-muted mb-4">Mint an ERC-721 identity token for a new agent</p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Agent metadata URI"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          className="flex-1 font-mono"
        />
        <Button
          disabled={isPending || confirming || !uri}
          onClick={() =>
            writeContract({
              address: IDENT,
              abi: IdentityRegistryABI,
              functionName: "register",
              args: [uri],
            })
          }
        >
          {confirming ? "Confirming..." : isPending ? "Signing..." : "Register"}
        </Button>
      </div>
      {isSuccess ? <p className="text-xs text-success mt-2">Agent registered successfully.</p> : null}
    </Card>
  );
}

function GiveFeedbackPanel() {
  const [agentId, setAgentId] = useState("");
  const [value, setValue] = useState("80");
  const [tag1, setTag1] = useState("quality");
  const [tag2, setTag2] = useState("rwa");
  const [endpoint, setEndpoint] = useState("cre://workflow");
  const [feedbackURI, setFeedbackURI] = useState("ipfs://feedback/example");

  const feedbackHash = useMemo(
    () => keccak256(toHex(`${agentId}:${value}:${tag1}:${tag2}:${endpoint}:${feedbackURI}`)),
    [agentId, value, tag1, tag2, endpoint, feedbackURI],
  );

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return (
    <Card>
      <CardTitle>Give Reputation Feedback</CardTitle>
      <p className="text-xs text-muted mb-4">Write ERC-8004 feedback to `ReputationRegistry`.</p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            placeholder="Agent ID"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="font-mono"
          />
          <input
            type="number"
            placeholder="Value (int128)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="text" value={tag1} onChange={(e) => setTag1(e.target.value)} placeholder="tag1" />
          <input type="text" value={tag2} onChange={(e) => setTag2(e.target.value)} placeholder="tag2" />
        </div>
        <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="endpoint" />
        <input
          type="text"
          value={feedbackURI}
          onChange={(e) => setFeedbackURI(e.target.value)}
          placeholder="feedbackURI"
          className="font-mono"
        />
        <code className="text-[11px] text-muted break-all block">feedbackHash: {feedbackHash}</code>
        <Button
          disabled={isPending || confirming || !agentId || value.trim() === ""}
          onClick={() =>
            writeContract({
              address: REP,
              abi: ReputationRegistryABI,
              functionName: "giveFeedback",
              args: [
                BigInt(agentId),
                BigInt(value),
                0,
                tag1,
                tag2,
                endpoint,
                feedbackURI,
                feedbackHash,
              ],
            })
          }
        >
          {confirming ? "Confirming..." : isPending ? "Signing..." : "Submit Feedback"}
        </Button>
        {isSuccess ? <p className="text-xs text-success">Feedback recorded on-chain.</p> : null}
      </div>
    </Card>
  );
}

function ValidationPanel() {
  return (
    <div className="space-y-4">
      <RequestValidation />
      <RespondValidation />
      <LookupValidation />
    </div>
  );
}

function RequestValidation() {
  const [validatorAddress, setValidatorAddress] = useState("");
  const [agentId, setAgentId] = useState("");
  const [requestURI, setRequestURI] = useState("ipfs://validation/request");
  const [requestHash, setRequestHash] = useState("");

  const generatedHash = useMemo(() => keccak256(toHex(`${agentId}:${requestURI}`)), [agentId, requestURI]);
  const effectiveHash = requestHash || generatedHash;

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return (
    <Card>
      <CardTitle>Request Validation</CardTitle>
      <p className="text-xs text-muted mb-3">Create a new validation request.</p>
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Validator address (0x...)"
          value={validatorAddress}
          onChange={(e) => setValidatorAddress(e.target.value)}
          className="font-mono"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            placeholder="Agent ID"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="font-mono"
          />
          <input type="text" placeholder="Request URI" value={requestURI} onChange={(e) => setRequestURI(e.target.value)} />
        </div>
        <input
          type="text"
          placeholder="Request hash (optional)"
          value={requestHash}
          onChange={(e) => setRequestHash(e.target.value)}
          className="font-mono"
        />
        {!requestHash ? <code className="text-[11px] text-muted break-all block">generated hash: {generatedHash}</code> : null}
        <Button
          disabled={
            isPending ||
            confirming ||
            !isAddress(validatorAddress) ||
            !agentId ||
            !isHex32(effectiveHash)
          }
          onClick={() =>
            writeContract({
              address: VAL,
              abi: ValidationRegistryABI,
              functionName: "validationRequest",
              args: [validatorAddress as `0x${string}`, BigInt(agentId), requestURI, effectiveHash as `0x${string}`],
            })
          }
        >
          {confirming ? "Confirming..." : isPending ? "Signing..." : "Request"}
        </Button>
        {isSuccess ? <p className="text-xs text-success">Validation request submitted.</p> : null}
      </div>
    </Card>
  );
}

function RespondValidation() {
  const [requestHash, setRequestHash] = useState("");
  const [responseScore, setResponseScore] = useState("100");
  const [responseURI, setResponseURI] = useState("ipfs://validation/response");
  const [tag, setTag] = useState("default");

  const responseHash = useMemo(() => keccak256(toHex(`${responseScore}:${responseURI}:${tag}`)), [responseScore, responseURI, tag]);
  const responseNum = Number(responseScore);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return (
    <Card>
      <CardTitle>Respond to Validation</CardTitle>
      <p className="text-xs text-muted mb-3">Post a validation response for a request hash.</p>
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Request hash (0x...)"
          value={requestHash}
          onChange={(e) => setRequestHash(e.target.value)}
          className="font-mono"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            min={0}
            max={100}
            placeholder="Response score (0-100)"
            value={responseScore}
            onChange={(e) => setResponseScore(e.target.value)}
            className="font-mono"
          />
          <input type="text" placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
        </div>
        <input type="text" placeholder="Response URI" value={responseURI} onChange={(e) => setResponseURI(e.target.value)} />
        <code className="text-[11px] text-muted break-all block">responseHash: {responseHash}</code>
        <Button
          disabled={
            isPending ||
            confirming ||
            !isHex32(requestHash) ||
            !Number.isFinite(responseNum) ||
            responseNum < 0 ||
            responseNum > 100
          }
          onClick={() =>
            writeContract({
              address: VAL,
              abi: ValidationRegistryABI,
              functionName: "validationResponse",
              args: [requestHash as `0x${string}`, responseNum, responseURI, responseHash, tag],
            })
          }
        >
          {confirming ? "Confirming..." : isPending ? "Signing..." : "Respond"}
        </Button>
        {isSuccess ? <p className="text-xs text-success">Validation response submitted.</p> : null}
      </div>
    </Card>
  );
}

function LookupValidation() {
  const [requestHash, setRequestHash] = useState("");
  const [queryHash, setQueryHash] = useState("");

  const { data: status } = useReadContract({
    address: VAL,
    abi: ValidationRegistryABI,
    functionName: "getValidationStatus",
    args: queryHash ? [queryHash as `0x${string}`] : undefined,
    query: { enabled: isHex32(queryHash) },
  });

  const st = status as
    | {
        validatorAddress: string;
        agentId: bigint;
        response: number;
        responseHash: string;
        tag: string;
        lastUpdate: bigint;
      }
    | undefined;

  return (
    <Card>
      <CardTitle>Lookup Validation Status</CardTitle>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Request hash (0x...)"
          value={requestHash}
          onChange={(e) => setRequestHash(e.target.value)}
          className="flex-1 font-mono"
        />
        <Button onClick={() => setQueryHash(requestHash)} disabled={!isHex32(requestHash)}>
          Lookup
        </Button>
      </div>
      {st ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Validator" value={truncAddr(st.validatorAddress)} />
          <Stat label="Agent ID" value={st.agentId.toString()} />
          <Stat label="Response" value={`${st.response}/100`} />
          <Stat label="Tag" value={st.tag || "--"} />
          <Stat label="Response Hash" value={truncAddr(st.responseHash, 6)} />
          <Stat label="Updated" value={formatTimestamp(st.lastUpdate)} />
        </div>
      ) : (
        <EmptyState message="No validation loaded." />
      )}
    </Card>
  );
}
