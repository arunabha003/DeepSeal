"use client";

import { useMemo, useState } from "react";
import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { keccak256, toHex, zeroAddress } from "viem";
import { ADDRESSES } from "@/lib/addresses";
import {
  IdentityRegistryABI,
  ReputationRegistryABI,
  ValidationRegistryABI,
  RWAComplianceReceiverABI,
} from "@/lib/abis";
import {
  Card,
  CardTitle,
  Stat,
  Badge,
  Button,
  EmptyState,
  AddressLink,
  TxLink,
} from "@/components/ui";
import { formatTimestamp, truncAddr, txUrl, agentUrl, erc8004ExplorerUrl } from "@/lib/utils";
import { BLOCK_EXPLORER, ERC8004_EXPLORER } from "@/lib/network";

const IDENT = ADDRESSES.IdentityRegistry as `0x${string}`;
const REP = ADDRESSES.ReputationRegistry as `0x${string}`;
const VAL = ADDRESSES.ValidationRegistry as `0x${string}`;
const RECV = ADDRESSES.RWAComplianceReceiver as `0x${string}`;
const OFFICIAL_IDENTITY_BASE_SEPOLIA =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e".toLowerCase();
const OFFICIAL_REPUTATION_BASE_SEPOLIA =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713".toLowerCase();

const isHex32 = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value);
const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

export default function AgentsPage() {
  const [tab, setTab] = useState<
    "browse" | "register" | "feedback" | "validate"
  >("browse");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Agent Registry
          </h1>
          <p className="text-sm text-muted mt-1">
            ERC-8004 identity, reputation &amp; validation — fully on-chain
          </p>
        </div>
        <a
          href={erc8004ExplorerUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
        >
          <span>View on 8004scan</span>
          <span className="text-[10px]">&#8599;</span>
        </a>
      </div>

      {/* Contract addresses bar */}
      <div className="bg-surface-1 border border-surface-3 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
        <div>
          <span className="text-muted block mb-0.5">IdentityRegistry</span>
          <AddressLink address={IDENT} chars={5} />
        </div>
        <div>
          <span className="text-muted block mb-0.5">ReputationRegistry</span>
          <AddressLink address={REP} chars={5} />
        </div>
        <div>
          <span className="text-muted block mb-0.5">ValidationRegistry</span>
          <AddressLink address={VAL} chars={5} />
        </div>
        <div>
          <span className="text-muted block mb-0.5">ComplianceReceiver</span>
          <AddressLink address={RECV} chars={5} />
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-surface-1 rounded-lg w-fit">
        {(["browse", "register", "feedback", "validate"] as const).map(
          (t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                tab === t
                  ? "bg-surface-3 text-white"
                  : "text-muted hover:text-zinc-300"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          )
        )}
      </div>

      {tab === "browse" && <BrowseAgents />}
      {tab === "register" && <RegisterAgent />}
      {tab === "feedback" && <GiveFeedbackPanel />}
      {tab === "validate" && <ValidationPanel />}
    </div>
  );
}

/* ----------------------------------------------------------------
   Browse Agents - real on-chain data with reputation and details
   ---------------------------------------------------------------- */
function BrowseAgents() {
  const usingOfficial8004 =
    IDENT.toLowerCase() === OFFICIAL_IDENTITY_BASE_SEPOLIA &&
    REP.toLowerCase() === OFFICIAL_REPUTATION_BASE_SEPOLIA;

  const { data: nextId } = useReadContract({
    address: IDENT,
    abi: IdentityRegistryABI,
    functionName: "nextAgentId",
    query: { refetchInterval: 6_000 },
  });

  const { data: recvData } = useReadContracts({
    contracts: [
      {
        address: RECV,
        abi: RWAComplianceReceiverABI,
        functionName: "reputationAgentId",
      },
      {
        address: RECV,
        abi: RWAComplianceReceiverABI,
        functionName: "validationAgentId",
      },
    ],
  });

  const repAgentId = recvData?.[0]?.result as bigint | undefined;
  const valAgentId = recvData?.[1]?.result as bigint | undefined;
  const count = Number(nextId ?? 1) - 1;

  const trackedAgentIds = useMemo(() => {
    const ids: bigint[] = [];
    if (repAgentId !== undefined && repAgentId > 0n) ids.push(repAgentId);
    if (
      valAgentId !== undefined &&
      valAgentId > 0n &&
      (repAgentId === undefined || valAgentId !== repAgentId)
    ) {
      ids.push(valAgentId);
    }
    return ids;
  }, [repAgentId, valAgentId]);

  const shouldEnumerate = !usingOfficial8004 && count > 0 && count <= 200;
  const visibleAgentIds = shouldEnumerate
    ? Array.from({ length: count }, (_, i) => BigInt(i + 1))
    : trackedAgentIds;

  if (visibleAgentIds.length === 0) {
    return (
      <EmptyState
        message={
          usingOfficial8004
            ? "No receiver-linked ERC-8004 agent IDs yet. Configure `reputationAgentId` / `validationAgentId` on receiver."
            : "No agents registered yet."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-surface-1 border border-surface-3 rounded-lg p-3 flex items-center gap-6 text-[11px]">
        <div>
          <span className="text-muted">
            {shouldEnumerate ? "Total Agents" : "Tracked Agents"}
          </span>
          <span className="ml-2 font-mono text-white font-bold">
            {shouldEnumerate ? count : visibleAgentIds.length}
          </span>
        </div>
        {repAgentId !== undefined && repAgentId > 0n && (
          <div>
            <span className="text-muted">Reputation Agent</span>
            <a
              href={agentUrl(repAgentId)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 font-mono text-accent font-bold hover:underline"
            >
              #{repAgentId.toString()} &#8599;
            </a>
          </div>
        )}
        {valAgentId !== undefined && valAgentId > 0n && (
          <div>
            <span className="text-muted">Validation Agent</span>
            <a
              href={agentUrl(valAgentId)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 font-mono text-accent font-bold hover:underline"
            >
              #{valAgentId.toString()} &#8599;
            </a>
          </div>
        )}
      </div>

      {!usingOfficial8004 && (
        <div className="text-[11px] text-muted bg-surface-1 border border-surface-3 rounded-lg p-2">
          8004scan tracks official ERC-8004 registries. Current Identity/Reputation
          addresses are custom, so explorer agent links may not resolve.
        </div>
      )}

      {!shouldEnumerate && !usingOfficial8004 && count > 200 && (
        <div className="text-[11px] text-muted bg-surface-1 border border-surface-3 rounded-lg p-2">
          Registry is large ({count.toLocaleString()} agents). Rendering only receiver-linked
          agents for performance.
        </div>
      )}

      {visibleAgentIds.map((id, i) => {
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

/* -- Single Agent Card -- */
function AgentRow({
  agentId,
  isRepAgent,
  isValAgent,
}: {
  agentId: bigint;
  isRepAgent: boolean;
  isValAgent: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  /* Identity reads */
  const { data: identityData } = useReadContracts({
    contracts: [
      {
        address: IDENT,
        abi: IdentityRegistryABI,
        functionName: "ownerOf",
        args: [agentId],
      },
      {
        address: IDENT,
        abi: IdentityRegistryABI,
        functionName: "tokenURI",
        args: [agentId],
      },
      {
        address: IDENT,
        abi: IdentityRegistryABI,
        functionName: "getAgentWallet",
        args: [agentId],
      },
    ],
  });

  /* Reputation reads - getSummary across all clients */
  const { data: repSummary } = useReadContract({
    address: REP,
    abi: ReputationRegistryABI,
    functionName: "getSummary",
    args: [agentId, [], "", ""],
    query: { refetchInterval: 8_000 },
  });

  /* Validation reads */
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

  // Reputation summary: [count, summaryValue, summaryValueDecimals]
  const repCount = repSummary
    ? Number((repSummary as readonly [bigint, bigint, number])[0])
    : 0;
  const repValue = repSummary
    ? Number((repSummary as readonly [bigint, bigint, number])[1])
    : 0;
  const repDecimals = repSummary
    ? Number((repSummary as readonly [bigint, bigint, number])[2])
    : 0;
  const repDisplay =
    repDecimals > 0
      ? (repValue / Math.pow(10, repDecimals)).toFixed(repDecimals)
      : repValue.toString();

  const roleLabel = isRepAgent
    ? "Reputation Agent"
    : isValAgent
      ? "Validation Agent"
      : "General";

  return (
    <Card className="hover:border-zinc-600 transition-colors">
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <a
            href={agentUrl(agentId)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center text-sm font-mono text-accent font-bold hover:bg-surface-3/80 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            #{agentId.toString()}
          </a>
          <div>
            <p className="text-sm text-white font-medium flex items-center gap-2">
              <a
                href={agentUrl(agentId)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Agent #{agentId.toString()}
              </a>
              {isRepAgent && <Badge variant="accent">REP</Badge>}
              {isValAgent && <Badge variant="accent">VAL</Badge>}
            </p>
            <p className="text-[11px] text-muted">{roleLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <span className="text-muted block text-[10px]">Reputation</span>
            <span className="font-mono text-white font-bold">
              {repCount > 0 ? repDisplay : "\u2014"}
            </span>
            {repCount > 0 && (
              <span className="text-muted ml-1">
                ({repCount} feedback{repCount !== 1 ? "s" : ""})
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-muted block text-[10px]">Validations</span>
            <span className="font-mono text-white font-bold">
              {validations.length}
            </span>
          </div>
          <span className="text-zinc-600 text-lg">
            {expanded ? "\u25BE" : "\u25B8"}
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-zinc-800 space-y-4">
          {/* Identity details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">
                NFT Owner
              </span>
              <AddressLink address={owner} chars={6} />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">
                Agent Wallet
              </span>
              {wallet && wallet !== zeroAddress ? (
                <AddressLink address={wallet} chars={6} />
              ) : (
                <span className="text-xs text-zinc-500 font-mono">
                  same as owner
                </span>
              )}
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">
                Token URI
              </span>
              <span className="text-xs font-mono text-zinc-400 break-all">
                {uri || "\u2014"}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">
                View on 8004scan
              </span>
              <a
                href={agentUrl(agentId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline inline-flex items-center gap-1"
              >
                Agent #{agentId.toString()} on 8004scan &#8599;
              </a>
              <a
                href={`${BLOCK_EXPLORER}/token/${IDENT}?a=${agentId.toString()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-1 inline-flex items-center gap-1 block"
              >
                ERC-721 on Basescan &#8599;
              </a>
            </div>
          </div>

          {/* Reputation details */}
          <div className="bg-surface-2/50 border border-surface-3/50 rounded-lg p-3">
            <h4 className="text-[10px] uppercase tracking-wider text-muted mb-2">
              Reputation Summary
            </h4>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted block">Feedback Count</span>
                <span className="font-mono text-white font-bold">
                  {repCount}
                </span>
              </div>
              <div>
                <span className="text-muted block">Cumulative Score</span>
                <span className="font-mono text-white font-bold">
                  {repDisplay}
                </span>
              </div>
              <div>
                <span className="text-muted block">Score Decimals</span>
                <span className="font-mono text-zinc-400">{repDecimals}</span>
              </div>
            </div>
          </div>

          {/* Validation hashes */}
          {validations.length > 0 && (
            <div className="bg-surface-2/50 border border-surface-3/50 rounded-lg p-3">
              <h4 className="text-[10px] uppercase tracking-wider text-muted mb-2">
                Validation Request Hashes
              </h4>
              <div className="space-y-1">
                {validations.map((hash, i) => (
                  <div
                    key={i}
                    className="text-[11px] font-mono text-zinc-400 break-all"
                  >
                    <span className="text-zinc-600 mr-2">{i + 1}.</span>
                    {hash}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* On-chain contract references */}
          <div className="pt-2 border-t border-zinc-800/50 grid grid-cols-3 gap-3 text-[10px]">
            <div>
              <span className="text-muted block mb-0.5">IdentityRegistry</span>
              <AddressLink
                address={IDENT}
                chars={4}
                className="!text-[10px]"
              />
            </div>
            <div>
              <span className="text-muted block mb-0.5">
                ReputationRegistry
              </span>
              <AddressLink
                address={REP}
                chars={4}
                className="!text-[10px]"
              />
            </div>
            <div>
              <span className="text-muted block mb-0.5">
                ValidationRegistry
              </span>
              <AddressLink
                address={VAL}
                chars={4}
                className="!text-[10px]"
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------
   Register Agent
   ---------------------------------------------------------------- */
function RegisterAgent() {
  const [uri, setUri] = useState("");
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <Card>
      <CardTitle>Register New Agent</CardTitle>
      <p className="text-xs text-muted mb-4">
        Mint an ERC-721 identity token for a new agent
      </p>
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
      {isSuccess && hash && (
        <p className="text-xs text-success mt-2">
          &#10003; Agent registered &mdash;{" "}
          <a
            href={txUrl(hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            View TX &#8599;
          </a>
        </p>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------
   Give Feedback
   ---------------------------------------------------------------- */
function GiveFeedbackPanel() {
  const [agentId, setAgentId] = useState("");
  const [value, setValue] = useState("80");
  const [tag1, setTag1] = useState("quality");
  const [tag2, setTag2] = useState("rwa");
  const [endpoint, setEndpoint] = useState("cre://workflow");
  const [feedbackURI, setFeedbackURI] = useState("ipfs://feedback/example");

  const feedbackHash = useMemo(
    () =>
      keccak256(
        toHex(
          `${agentId}:${value}:${tag1}:${tag2}:${endpoint}:${feedbackURI}`
        )
      ),
    [agentId, value, tag1, tag2, endpoint, feedbackURI]
  );

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <Card>
      <CardTitle>Give Reputation Feedback</CardTitle>
      <p className="text-xs text-muted mb-4">
        Write ERC-8004 feedback to ReputationRegistry.
      </p>
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
          <input
            type="text"
            value={tag1}
            onChange={(e) => setTag1(e.target.value)}
            placeholder="tag1"
          />
          <input
            type="text"
            value={tag2}
            onChange={(e) => setTag2(e.target.value)}
            placeholder="tag2"
          />
        </div>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="endpoint"
        />
        <input
          type="text"
          value={feedbackURI}
          onChange={(e) => setFeedbackURI(e.target.value)}
          placeholder="feedbackURI"
          className="font-mono"
        />
        <div className="bg-surface-2/50 border border-surface-3/50 rounded p-2 text-[11px] space-y-1">
          <div>
            <span className="text-muted">feedbackHash:</span>
            <code className="ml-1 text-zinc-400 break-all">{feedbackHash}</code>
          </div>
          <div>
            <span className="text-muted">contract:</span>
            <AddressLink
              address={REP}
              chars={6}
              className="ml-1 !text-[11px]"
            />
          </div>
        </div>
        <Button
          disabled={
            isPending || confirming || !agentId || value.trim() === ""
          }
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
          {confirming
            ? "Confirming..."
            : isPending
              ? "Signing..."
              : "Submit Feedback"}
        </Button>
        {isSuccess && hash && (
          <p className="text-xs text-success">
            &#10003; Feedback recorded &mdash;{" "}
            <a
              href={txUrl(hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              View TX &#8599;
            </a>
          </p>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------
   Validation Panel
   ---------------------------------------------------------------- */
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

  const generatedHash = useMemo(
    () => keccak256(toHex(`${agentId}:${requestURI}`)),
    [agentId, requestURI]
  );
  const effectiveHash = requestHash || generatedHash;

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <Card>
      <CardTitle>Request Validation</CardTitle>
      <p className="text-xs text-muted mb-3">
        Create a new validation request.
      </p>
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
          <input
            type="text"
            placeholder="Request URI"
            value={requestURI}
            onChange={(e) => setRequestURI(e.target.value)}
          />
        </div>
        <input
          type="text"
          placeholder="Request hash (optional)"
          value={requestHash}
          onChange={(e) => setRequestHash(e.target.value)}
          className="font-mono"
        />
        {!requestHash && (
          <div className="bg-surface-2/50 border border-surface-3/50 rounded p-2 text-[11px]">
            <span className="text-muted">generated hash:</span>
            <code className="ml-1 text-zinc-400 break-all">
              {generatedHash}
            </code>
          </div>
        )}
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
              args: [
                validatorAddress as `0x${string}`,
                BigInt(agentId),
                requestURI,
                effectiveHash as `0x${string}`,
              ],
            })
          }
        >
          {confirming
            ? "Confirming..."
            : isPending
              ? "Signing..."
              : "Request"}
        </Button>
        {isSuccess && hash && (
          <p className="text-xs text-success">
            &#10003; Validation request submitted &mdash;{" "}
            <a
              href={txUrl(hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              View TX &#8599;
            </a>
          </p>
        )}
      </div>
    </Card>
  );
}

function RespondValidation() {
  const [requestHash, setRequestHash] = useState("");
  const [responseScore, setResponseScore] = useState("100");
  const [responseURI, setResponseURI] = useState(
    "ipfs://validation/response"
  );
  const [tag, setTag] = useState("default");

  const responseHash = useMemo(
    () => keccak256(toHex(`${responseScore}:${responseURI}:${tag}`)),
    [responseScore, responseURI, tag]
  );
  const responseNum = Number(responseScore);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <Card>
      <CardTitle>Respond to Validation</CardTitle>
      <p className="text-xs text-muted mb-3">
        Post a validation response for a request hash.
      </p>
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
          <input
            type="text"
            placeholder="Tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
        </div>
        <input
          type="text"
          placeholder="Response URI"
          value={responseURI}
          onChange={(e) => setResponseURI(e.target.value)}
        />
        <div className="bg-surface-2/50 border border-surface-3/50 rounded p-2 text-[11px]">
          <span className="text-muted">responseHash:</span>
          <code className="ml-1 text-zinc-400 break-all">{responseHash}</code>
        </div>
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
              args: [
                requestHash as `0x${string}`,
                responseNum,
                responseURI,
                responseHash,
                tag,
              ],
            })
          }
        >
          {confirming
            ? "Confirming..."
            : isPending
              ? "Signing..."
              : "Respond"}
        </Button>
        {isSuccess && hash && (
          <p className="text-xs text-success">
            &#10003; Validation response submitted &mdash;{" "}
            <a
              href={txUrl(hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              View TX &#8599;
            </a>
          </p>
        )}
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
        <Button
          onClick={() => setQueryHash(requestHash)}
          disabled={!isHex32(requestHash)}
        >
          Lookup
        </Button>
      </div>
      {st ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">
                Validator
              </span>
              <AddressLink address={st.validatorAddress} chars={6} />
            </div>
            <Stat label="Agent ID" value={`#${st.agentId.toString()}`} />
            <Stat label="Response" value={`${st.response}/100`} />
            <Stat label="Tag" value={st.tag || "--"} />
          </div>
          <div className="text-[11px] space-y-1 border-t border-zinc-800 pt-3">
            <div>
              <span className="text-muted">Response Hash:</span>
              <code className="ml-1 text-zinc-400 break-all">
                {st.responseHash}
              </code>
            </div>
            <div>
              <span className="text-muted">Last Updated:</span>
              <span className="ml-1 text-zinc-300">
                {formatTimestamp(st.lastUpdate)}
              </span>
              </div>
          </div>
        </div>
      ) : (
        <EmptyState message="No validation loaded." />
      )}
    </Card>
  );
}
