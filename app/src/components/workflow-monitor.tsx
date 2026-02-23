"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { txUrl } from "@/lib/utils";

const isEvmAddress = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);

/* ── Types ───────────────────────────────────────────────────────────── */
type StepStatus = "pending" | "running" | "complete" | "error";

interface StepData {
  id: string;
  status: StepStatus;
  label: string;
  detail: string;
  data?: Record<string, unknown>;
}

interface LogEntry {
  raw: string;
  ts: string;
}

interface WorkflowMonitorProps {
  requestId: number;
  onComplete?: (result: Record<string, unknown>) => void;
}

/* ── Step definitions (pipeline order) ───────────────────────────────── */
const PIPELINE: { id: string; label: string }[] = [
  { id: "payload", label: "Build Trigger Payload" },
  { id: "timestamp", label: "Synchronize Chain Timestamp (Anvil local only)" },
  { id: "cre-init", label: "Initialize CRE Simulation" },
  { id: "read-request", label: "Read On-Chain Request" },
  { id: "doc-resolve", label: "Resolve & Verify Document Bundle" },
  { id: "kyb", label: "Run KYB Verification (Sumsub + x402)" },
  { id: "gemini", label: "Run AI Risk Scoring (Gemini)" },
  { id: "decision", label: "Merge Final Decision" },
  { id: "write-report", label: "Encode Workflow Report" },
  { id: "onchain-write", label: "Broadcast On-Chain (onReport)" },
  { id: "side-effects", label: "On-Chain Side Effects" },
];

/* ── Component ───────────────────────────────────────────────────────── */
export function WorkflowMonitor({
  requestId,
  onComplete,
}: WorkflowMonitorProps) {
  const [steps, setSteps] = useState<Map<string, StepData>>(new Map());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const run = useCallback(async () => {
    setIsRunning(true);
    setIsDone(false);
    setError(null);
    setSimResult(null);
    setSteps(new Map());
    setLogs([]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/workflow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        setError(`API returned ${res.status}`);
        setIsRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\S+)/m);
          const dataMatch = part.match(/^data: (.+)/m);
          if (!eventMatch || !dataMatch) continue;

          const event = eventMatch[1];
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataMatch[1]);
          } catch {
            continue;
          }

          switch (event) {
            case "step": {
              const s = data as unknown as StepData;
              setSteps((prev) => {
                const next = new Map(prev);
                next.set(s.id, s);
                return next;
              });
              break;
            }
            case "log": {
              const l = data as unknown as LogEntry;
              setLogs((prev) => [...prev, l]);
              scrollToBottom();
              break;
            }
            case "result":
              setSimResult(data);
              break;
            case "error":
              setError(String(data.message));
              break;
            case "done":
              setIsDone(true);
              setIsRunning(false);
              if (onComplete && simResult) onComplete(simResult);
              break;
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || String(err));
      }
    } finally {
      setIsRunning(false);
    }
  }, [requestId, onComplete, scrollToBottom, simResult]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  /* ── Derive step display ─────────────────────────────────────────── */
  const getStepState = (id: string): StepData | undefined => steps.get(id);

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
            CRE Workflow — Request #{requestId}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            DeepSeal flow: on-chain read → document verify → KYB + AI → on-chain report
          </p>
        </div>
        <div className="flex gap-2">
          {!isRunning && !isDone && (
            <button
              onClick={run}
              className="px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              ▶ Run Workflow
            </button>
          )}
          {isRunning && (
            <button
              onClick={cancel}
              className="px-4 py-2 rounded-md text-sm font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
            >
              ■ Cancel
            </button>
          )}
          {isDone && (
            <button
              onClick={run}
              className="px-4 py-2 rounded-md text-sm font-medium bg-surface-3 text-zinc-300 hover:bg-surface-4 transition-colors"
            >
              ↻ Re-run
            </button>
          )}
        </div>
      </div>

      {/* ── Pipeline steps ─────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-surface-3 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Pipeline
          </span>
          {isRunning && (
            <span className="text-[10px] font-mono text-accent animate-pulse">
              processing...
            </span>
          )}
          {isDone && !error && (
            <span className="text-[10px] font-mono text-success">
              ✓ complete
            </span>
          )}
          {error && (
            <span className="text-[10px] font-mono text-danger">
              ✕ error
            </span>
          )}
        </div>
        <div className="divide-y divide-surface-3/50">
          {PIPELINE.map((p) => {
            const step = getStepState(p.id);
            const status: StepStatus = step?.status || "pending";
            const label = step?.label || p.label;
            const detail = step?.detail || "";

            return (
              <div
                key={p.id}
                className={cn(
                  "px-4 py-3 flex items-start gap-3 transition-colors duration-300",
                  status === "running" && "bg-accent/5",
                  status === "complete" && "bg-success/[0.02]",
                  status === "error" && "bg-danger/5"
                )}
              >
                {/* Status icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {status === "pending" && (
                    <div className="w-5 h-5 rounded-full border border-surface-4 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-surface-4" />
                    </div>
                  )}
                  {status === "running" && (
                    <div className="w-5 h-5 rounded-full border-2 border-accent flex items-center justify-center animate-spin">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                    </div>
                  )}
                  {status === "complete" && (
                    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {status === "error" && (
                    <div className="w-5 h-5 rounded-full bg-danger/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      status === "pending" && "text-zinc-500",
                      status === "running" && "text-accent",
                      status === "complete" && "text-zinc-200",
                      status === "error" && "text-danger"
                    )}
                  >
                    {label}
                  </p>
                  {detail && (
                    <p className="text-xs text-muted mt-0.5 font-mono break-all">
                      {detail}
                    </p>
                  )}

                  {/* Document resolution data card */}
                  {step?.data && p.id === "doc-resolve" && (
                    <div className="mt-2 p-2.5 rounded bg-surface-2/50 border border-surface-3/50 text-[11px] space-y-1.5">
                      {step.data.companyName ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-muted block">Company</span>
                            <span className="font-mono text-white">{String(step.data.companyName)}</span>
                          </div>
                          <div>
                            <span className="text-muted block">Country</span>
                            <span className="font-mono text-white">{String(step.data.country)}</span>
                          </div>
                        </div>
                      ) : null}
                      {step.data.extractionHash ? (
                        <div>
                          <span className="text-muted block">Extraction Hash</span>
                          <span className="font-mono text-zinc-300 break-all">{String(step.data.extractionHash)}</span>
                        </div>
                      ) : null}
                      {step.data.sourceHash ? (
                        <div>
                          <span className="text-muted block">Source Hash</span>
                          <span className="font-mono text-zinc-400 break-all">{String(step.data.sourceHash)}</span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* KYB data card */}
                  {step?.data && p.id === "kyb" && (
                    <div className="mt-2 space-y-2">
                      {(() => {
                        const providerStatus = String(step.data.providerStatus ?? "UNKNOWN");
                        const providerScore = Number(step.data.providerScore ?? 0);
                        return (
                      <div className="p-2.5 rounded bg-surface-2/50 border border-surface-3/50 grid grid-cols-3 gap-3 text-[11px]">
                        <div>
                          <span className="text-muted block">Provider</span>
                          <span className="font-mono text-white">Sumsub</span>
                        </div>
                        <div>
                          <span className="text-muted block">Status</span>
                          <span
                            className={cn(
                              "font-mono font-bold",
                              providerStatus === "APPROVED"
                                ? "text-success"
                                : providerStatus === "REJECTED"
                                  ? "text-danger"
                                  : "text-zinc-300"
                            )}
                          >
                            {providerStatus}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted block">Provider Score</span>
                          <span className="font-mono text-white">
                            {providerScore} / 1000
                          </span>
                        </div>
                      </div>
                        );
                      })()}

                      {/* x402 Payment Details */}
                      {Boolean(step.data.x402Payment) && (
                        <div className="p-2.5 rounded bg-accent/5 border border-accent/20">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">
                              x402 Payment
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-mono">
                              ✓ verified
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                            <div>
                              <span className="text-muted block">Amount</span>
                              <span className="font-mono text-white font-bold">
                                {String(step.data.x402Amount || "0.01")}{" "}
                                <span className="text-accent">{String(step.data.x402Asset || "USDC")}</span>
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">Network</span>
                              <span className="font-mono text-white">
                                {String(step.data.x402Network || "base-sepolia")}
                              </span>
                            </div>
                            {isEvmAddress(step.data.x402Payer) && (
                              <div>
                                <span className="text-muted block">Payer</span>
                                <a
                                  href={`https://sepolia.basescan.org/address/${step.data.x402Payer}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-accent hover:underline inline-flex items-center gap-0.5"
                                >
                                  {step.data.x402Payer.slice(0, 8)}...{step.data.x402Payer.slice(-4)}
                                  <span className="text-[9px]">↗</span>
                                </a>
                              </div>
                            )}
                            {isEvmAddress(step.data.x402PayTo) && (
                              <div>
                                <span className="text-muted block">Recipient</span>
                                <a
                                  href={`https://sepolia.basescan.org/address/${step.data.x402PayTo}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-accent hover:underline inline-flex items-center gap-0.5"
                                >
                                  {step.data.x402PayTo.slice(0, 8)}...{step.data.x402PayTo.slice(-4)}
                                  <span className="text-[9px]">↗</span>
                                </a>
                              </div>
                            )}
                            <div>
                              <span className="text-muted block">Protocol</span>
                              <span className="font-mono text-zinc-400">
                                {String(step.data.x402Protocol || "EIP-3009")}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">Scheme</span>
                              <span className="font-mono text-zinc-400">
                                {String(step.data.x402Scheme || "exact")}
                              </span>
                            </div>
                            {typeof step.data.x402TxHash === "string" &&
                              /^0x[0-9a-fA-F]{64}$/.test(step.data.x402TxHash) && (
                                <div className="col-span-2">
                                  <span className="text-muted block">Payment Tx</span>
                                  {(() => {
                                    const explicitUrl =
                                      typeof step.data.x402TxUrl === "string" && step.data.x402TxUrl.length > 0
                                        ? step.data.x402TxUrl
                                        : txUrl(step.data.x402TxHash);
                                    return (
                                  <a
                                    href={explicitUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-accent hover:underline inline-flex items-center gap-0.5"
                                  >
                                    {step.data.x402TxHash.slice(0, 10)}...{step.data.x402TxHash.slice(-8)}
                                    <span className="text-[9px]">↗</span>
                                  </a>
                                    );
                                  })()}
                                </div>
                              )}
                            <div className="col-span-2">
                              <span className="text-muted block">USDC Contract</span>
                              <a
                                href={`https://sepolia.basescan.org/address/${String(step.data.x402AssetAddress || "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-accent/70 hover:underline text-[10px] inline-flex items-center gap-0.5"
                              >
                                {String(step.data.x402AssetAddress || "")}
                                <span className="text-[9px]">↗</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Gemini data card */}
                  {step?.data && p.id === "gemini" && (
                    <div className="mt-2 space-y-2">
                      {/* What Gemini analyzed */}
                      {Boolean(step.data.analyzedCompany || step.data.kybInputStatus) && (
                        <div className="p-2.5 rounded bg-accent/5 border border-accent/20 text-[11px]">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent mb-1.5 block">
                            Gemini Input Context
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {Boolean(step.data.analyzedCompany) && (
                              <div>
                                <span className="text-muted block">Company</span>
                                <span className="font-mono text-white">{String(step.data.analyzedCompany)}</span>
                              </div>
                            )}
                            {Boolean(step.data.analyzedCountry) && (
                              <div>
                                <span className="text-muted block">Country</span>
                                <span className="font-mono text-white">{String(step.data.analyzedCountry)}</span>
                              </div>
                            )}
                            {Boolean(step.data.analyzedRegNumber) && (
                              <div>
                                <span className="text-muted block">Reg. Number</span>
                                <span className="font-mono text-white">{String(step.data.analyzedRegNumber)}</span>
                              </div>
                            )}
                            {Boolean(step.data.kybInputStatus) && (
                              <div>
                                <span className="text-muted block">KYB Status (input)</span>
                                <span className={cn("font-mono font-bold", String(step.data.kybInputStatus) === "APPROVED" ? "text-success" : "text-danger")}>
                                  {String(step.data.kybInputStatus)}
                                </span>
                              </div>
                            )}
                          </div>
                          {Boolean(step.data.documentSourceHash) && (
                            <div className="mt-1.5">
                              <span className="text-muted block">Doc Source Hash</span>
                              <span className="font-mono text-zinc-500 break-all text-[10px]">{String(step.data.documentSourceHash)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Gemini verdict */}
                      <div className="p-2.5 rounded bg-surface-2/50 border border-surface-3/50 grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <span className="text-muted block">Gemini Says</span>
                          <span
                            className={cn(
                              "font-mono font-bold",
                              step.data.geminiApproved
                                ? "text-success"
                                : "text-danger"
                            )}
                          >
                            {step.data.geminiApproved
                              ? "APPROVE"
                              : "REJECT"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted block">Risk Score</span>
                          <span className="font-mono text-white">
                            {String(step.data.geminiRiskScore)} / 1000
                          </span>
                        </div>
                      </div>
                      {Array.isArray(step.data.reasons) &&
                        (step.data.reasons as string[]).length > 0 && (
                          <div className="p-2.5 rounded bg-surface-2/50 border border-surface-3/50 text-[11px]">
                            <span className="text-muted block mb-1">
                              AI Reasons
                            </span>
                            <ul className="space-y-0.5">
                              {(step.data.reasons as string[]).map(
                                (r, i) => (
                                  <li
                                    key={i}
                                    className="text-zinc-400 font-mono flex gap-1.5"
                                  >
                                    <span className="text-accent/60">→</span>
                                    {r}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}

                  {/* Decision data card */}
                  {step?.data && p.id === "decision" && (
                    <div className="mt-2 p-2.5 rounded bg-surface-2/50 border border-surface-3/50 grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <span className="text-muted block">
                          Final Verdict
                        </span>
                        <span
                          className={cn(
                            "font-mono font-bold text-base",
                            step.data.approved
                              ? "text-success"
                              : "text-danger"
                          )}
                        >
                          {step.data.approved ? "✓ APPROVED" : "✕ REJECTED"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted block">
                          Combined Risk
                        </span>
                        <span className="font-mono font-bold text-base text-white">
                          {String(step.data.riskScore)} / 1000
                        </span>
                      </div>
                    </div>
                  )}

                  {/* On-chain write data card */}
                  {step?.data && p.id === "onchain-write" && (
                    <div className="mt-2 p-2.5 rounded bg-surface-2/50 border border-surface-3/50 text-[11px] space-y-1">
                      {step.data.txHash ? (
                        <div className="flex gap-2">
                          <span className="text-muted w-14">TX</span>
                          <a
                            href={txUrl(String(step.data.txHash))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-accent hover:underline break-all inline-flex items-center gap-1"
                          >
                            {String(step.data.txHash)}
                            <span className="text-[9px]">↗</span>
                          </a>
                        </div>
                      ) : null}
                      {step.data.blockNumber ? (
                        <div className="flex gap-2">
                          <span className="text-muted w-14">Block</span>
                          <span className="font-mono text-white">
                            {String(step.data.blockNumber)}
                          </span>
                        </div>
                      ) : null}
                      {step.data.gasUsed ? (
                        <div className="flex gap-2">
                          <span className="text-muted w-14">Gas</span>
                          <span className="font-mono text-zinc-400">
                            {String(step.data.gasUsed)}
                          </span>
                        </div>
                      ) : null}
                      {step.data.logsCount ? (
                        <div className="flex gap-2">
                          <span className="text-muted w-14">Events</span>
                          <span className="font-mono text-white">
                            {String(step.data.logsCount)} emitted
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Side effects data card */}
                  {step?.data && p.id === "side-effects" && (
                    <div className="mt-2 space-y-2">
                      {Boolean(step.data.assetId || step.data.vaultAddress) && (
                        <div className="p-2.5 rounded bg-success/5 border border-success/20 text-[11px]">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-success">
                              RWA Asset Lifecycle
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success font-mono">
                              ✓ on-chain
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {step.data.requestId ? (
                              <div>
                                <span className="text-muted block">Request ID</span>
                                <span className="font-mono text-white">#{String(step.data.requestId)}</span>
                              </div>
                            ) : null}
                            {typeof step.data.assetId === "string" && /^0x[0-9a-fA-F]{64}$/.test(step.data.assetId) ? (
                              <div>
                                <span className="text-muted block">Asset ID</span>
                                <code className="font-mono text-zinc-300" title={step.data.assetId}>
                                  {step.data.assetId.slice(0, 14)}...{step.data.assetId.slice(-10)}
                                </code>
                              </div>
                            ) : null}
                            {isEvmAddress(step.data.vaultAddress) ? (
                              <div className="md:col-span-2">
                                <span className="text-muted block">Per-Asset Vault</span>
                                <a
                                  href={`https://sepolia.basescan.org/address/${step.data.vaultAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-accent hover:underline inline-flex items-center gap-0.5"
                                >
                                  {step.data.vaultAddress}
                                  <span className="text-[9px]">↗</span>
                                </a>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                      {/* ERC-8004 Agent Scores */}
                      {Array.isArray(step.data.erc8004Agents) && (step.data.erc8004Agents as { agentId: number; value: number; decimals: number; display: string }[]).length > 0 && (
                        <div className="p-2.5 rounded bg-accent/5 border border-accent/20 text-[11px]">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">
                              ERC-8004 Agent Scores
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-mono">
                              ✓ on-chain
                            </span>
                          </div>
                          <div className="space-y-2">
                            {(step.data.erc8004Agents as { agentId: number; value: number; decimals: number; display: string }[]).map((agent, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <a
                                    href={`https://testnet.8004scan.io/agents/base-sepolia/${agent.agentId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-accent hover:underline inline-flex items-center gap-0.5"
                                  >
                                    Agent #{agent.agentId}
                                    <span className="text-[9px]">↗</span>
                                  </a>
                                  <span className="text-muted">
                                    {i === 0 ? "(Reputation)" : "(Validation)"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-24 h-2 rounded-full bg-surface-3 overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        Number(agent.display) >= 70 ? "bg-success" : Number(agent.display) >= 40 ? "bg-warning" : "bg-danger"
                                      )}
                                      style={{ width: `${Math.max(0, Math.min(100, Number(agent.display)))}%` }}
                                    />
                                  </div>
                                  <span className={cn(
                                    "font-mono font-bold text-xs min-w-[3rem] text-right",
                                    Number(agent.display) >= 70 ? "text-success" : Number(agent.display) >= 40 ? "text-warning" : "text-danger"
                                  )}>
                                    {agent.display}/100
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* EAS Attestation */}
                      {Boolean(step.data.easAttestationUid) && (
                        <div className="p-2.5 rounded bg-success/5 border border-success/20 text-[11px]">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-success">
                              EAS Attestation
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success font-mono">
                              ✓ on-chain
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div>
                              <span className="text-muted block">Attestation UID</span>
                              <a
                                href={`https://base-sepolia.easscan.org/attestation/view/${String(step.data.easAttestationUid)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-accent hover:underline break-all inline-flex items-center gap-1 text-[10px]"
                              >
                                {String(step.data.easAttestationUid)}
                                <span className="text-[9px]">↗</span>
                              </a>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-1">
                              <div>
                                <span className="text-muted block">Contract</span>
                                <span className="font-mono text-zinc-400">0x4200...0021</span>
                              </div>
                              <div>
                                <span className="text-muted block">Schema Registry</span>
                                <span className="font-mono text-zinc-400">0x4200...0020</span>
                              </div>
                              <div>
                                <span className="text-muted block">Revocable</span>
                                <span className="font-mono text-success">Yes</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Event list */}
                      <div className="p-2.5 rounded bg-surface-2/50 border border-surface-3/50 text-[11px]">
                        <span className="text-muted block mb-1">
                          Events Emitted
                        </span>
                        <ul className="space-y-0.5">
                          {(
                            (step.data.events as string[]) || []
                          ).map((e, i) => (
                            <li
                              key={i}
                              className="text-zinc-400 font-mono flex gap-1.5"
                            >
                              <span className="text-success/60">●</span>
                              {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Simulation result summary ──────────────────────────────── */}
      {simResult && !simResult.error && (
        <div className="bg-surface-1 border border-surface-3 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Workflow Result
            </span>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
            <div>
              <span className="text-muted block mb-0.5">Request ID</span>
              <span className="font-mono text-white">
                #{String(simResult.requestId ?? requestId)}
              </span>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Subject</span>
              <a
                href={`https://sepolia.basescan.org/address/${String(simResult.subject)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-accent hover:underline break-all text-xs inline-flex items-center gap-1"
              >
                {String(simResult.subject).slice(0, 10)}...
                {String(simResult.subject).slice(-6)}
                <span className="text-[9px]">↗</span>
              </a>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Approved</span>
              <span
                className={cn(
                  "font-mono font-bold",
                  simResult.approved ? "text-success" : "text-danger"
                )}
              >
                {simResult.approved ? "YES" : "NO"}
              </span>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Risk Score</span>
              <span className="font-mono text-white">
                {String(simResult.riskScore)}/1000
              </span>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Report Hash</span>
              <span className="font-mono text-zinc-400 break-all">
                {String(simResult.reportHash || simResult.attestationHash || "").slice(0, 14)}...
              </span>
            </div>
          </div>
          {/* Cryptographic provenance hashes */}
          <div className="px-4 pb-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            {!!simResult.documentSourceHash && (
              <div>
                <span className="text-muted block mb-0.5">Document Source Hash</span>
                <code className="font-mono text-zinc-500 break-all block text-[10px]">
                  {String(simResult.documentSourceHash)}
                </code>
              </div>
            )}
            {!!simResult.extractionHash && (
              <div>
                <span className="text-muted block mb-0.5">Extraction Hash</span>
                <code className="font-mono text-zinc-500 break-all block text-[10px]">
                  {String(simResult.extractionHash)}
                </code>
              </div>
            )}
          </div>
          {/* Full attestation hash for verification */}
          {!!(simResult.reportHash || simResult.attestationHash) && (
            <div className="px-4 pb-4 text-[11px]">
              <span className="text-muted block mb-0.5">Full Attestation Hash</span>
              <code className="font-mono text-zinc-500 break-all block">
                {String(simResult.reportHash || simResult.attestationHash)}
              </code>
            </div>
          )}
        </div>
      )}

      {/* ── Error display ──────────────────────────────────────────── */}
      {error && (
        <div className="p-4 rounded-lg bg-danger/5 border border-danger/20 text-sm text-danger font-mono break-all">
          {error}
        </div>
      )}

      {/* ── Raw log feed ───────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className="bg-surface-1 border border-surface-3 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Workflow Terminal Output
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {logs.length} lines
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto p-3 space-y-0.5 scrollbar-thin">
            {logs.map((l, i) => (
              <div key={i} className="text-[11px] font-mono leading-relaxed">
                <span className="text-zinc-600 select-none mr-2">
                  {String(i + 1).padStart(3, " ")}
                </span>
                <span
                  className={cn(
                    "text-zinc-400",
                    l.raw.includes("[USER LOG]") && "text-accent/80",
                    l.raw.includes("[SIMULATION]") && "text-zinc-500",
                    l.raw.includes("Error") && "text-danger/80",
                    l.raw.includes("Workflow Simulation Result") &&
                      "text-success/80"
                  )}
                >
                  {l.raw}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
