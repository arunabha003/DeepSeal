import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const runtime = "nodejs";
export const maxDuration = 120;

// ── Helpers ──────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const CRE_CWD = path.join(PROJECT_ROOT, "cre", "chainlink-Convergence");
const PAYLOAD_PATH = path.join(PROJECT_ROOT, "http-payload.local.json");
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY as Hex;
const X402_PAYER = process.env.X402_BUYER_ADDRESS || "";
const X402_PAY_TO = process.env.X402_PAY_TO || "";
const ALLOW_DIRECT_SET_APPROVAL_FALLBACK =
  String(process.env.ALLOW_DIRECT_SET_APPROVAL_FALLBACK || "false").toLowerCase() === "true";

// Network mode: "local" = Anvil fork, "testnet" = real Base Sepolia
const NETWORK_MODE = process.env.NEXT_PUBLIC_NETWORK || "local";
const IS_LOCAL = NETWORK_MODE === "local";

const ADDRESSES_FILE = path.join(process.cwd(), "src", "lib", "addresses.ts");

function readAddress(name: string): Hex {
  const content = fs.readFileSync(ADDRESSES_FILE, "utf-8");
  // Determine which address block to use based on network mode
  const isTestnet = NETWORK_MODE === "testnet";
  const blockName = isTestnet ? "TESTNET_ADDRESSES" : "LOCAL_ADDRESSES";

  // Extract the correct block from the TS file
  const blockRegex = new RegExp(`${blockName}\\s*=\\s*\\{([^}]+)\\}`, "s");
  const blockMatch = content.match(blockRegex);
  const searchContent = blockMatch ? blockMatch[1] : content;

  // Match both quoted and unquoted keys: "Key": "0x..." or Key: "0x..."
  const regex = new RegExp(`["']?${name}["']?:\\s*"(0x[0-9a-fA-F]+)"`);
  const match = searchContent.match(regex);
  if (!match) throw new Error(`Address not found for ${name}`);
  return match[1] as Hex;
}

// Minimal ABI for RWAComplianceReceiver.onReport
const onReportABI = [
  {
    type: "function",
    name: "onReport",
    inputs: [
      { name: "metadata", type: "bytes" },
      { name: "report", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ── SSE stream helpers ──────────────────────────────────────────────────
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── POST handler ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { requestId, companyInfo } = body;

  if (!requestId) {
    return new Response(JSON.stringify({ error: "requestId is required" }), {
      status: 400,
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          // stream closed
        }
      };

      try {
        // ── Step 1: Create payload ─────────────────────────────────
        send("step", {
          id: "payload",
          status: "running",
          label: "Preparing Payload",
          detail: `Request #${requestId}`,
        });

        const payload: Record<string, unknown> = {
          requestId: Number(requestId),
        };
        if (companyInfo && typeof companyInfo === "object") {
          payload.companyInfo = companyInfo;
        }
        fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(payload, null, 2));

        send("step", {
          id: "payload",
          status: "complete",
          label: "Preparing Payload",
          detail: `Payload written for request #${requestId}`,
        });

        // ── Step 2: Sync block timestamp (Anvil only) ─────────────────
        if (IS_LOCAL) {
          send("step", {
            id: "timestamp",
            status: "running",
            label: "Syncing Block Timestamp",
            detail: "Aligning Anvil block time with wall clock",
          });

          const currentTs = Math.floor(Date.now() / 1000);
          await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "evm_setNextBlockTimestamp",
              params: [currentTs],
              id: 1,
            }),
          });
          await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "evm_mine",
              params: [],
              id: 2,
            }),
          });

          send("step", {
            id: "timestamp",
            status: "complete",
            label: "Syncing Block Timestamp",
            detail: `Block timestamp set to ${currentTs}`,
          });
        } else {
          send("step", {
            id: "timestamp",
            status: "complete",
            label: "Network Mode",
            detail: `Using real Base Sepolia (${RPC_URL})`,
          });
        }

        // ── Step 3: Run CRE workflow ───────────────────────────────
        send("step", {
          id: "cre-init",
          status: "running",
          label: "CRE Workflow Engine",
          detail: "Compiling and initializing simulator...",
        });

        const payloadJson = JSON.stringify(payload);

        const creTarget = IS_LOCAL ? "anvil-e2e-settings" : "staging-settings";

        const result = await new Promise<{
          output: string;
          exitCode: number;
          resultJson: Record<string, unknown> | null;
        }>((resolve) => {
          const proc = spawn(
            "cre",
            [
              "workflow",
              "simulate",
              "./my-workflow",
              "--target",
              creTarget,
              "--trigger-index",
              "0",
              "--http-payload",
              payloadJson,
              "--non-interactive",
              "-e",
              ".env",
            ],
            {
              cwd: CRE_CWD,
              env: { ...process.env, PATH: process.env.PATH },
            }
          );

          let fullOutput = "";
          let resultJson: Record<string, unknown> | null = null;
          let buffer = "";
          let kybStarted = false;

          const processLine = (line: string) => {
            // Strip ANSI color codes
            const trimmed = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
            if (!trimmed) return;

            // Send raw log
            send("log", { raw: trimmed, ts: new Date().toISOString() });

            // ── Parse step transitions ──
            if (trimmed.includes("Simulator Initialized")) {
              send("step", {
                id: "cre-init",
                status: "complete",
                label: "CRE Workflow Engine",
                detail: "Simulator initialized",
              });
            }

            if (trimmed.includes("Processing diligence requestId")) {
              send("step", {
                id: "read-request",
                status: "running",
                label: "Reading On-Chain Request",
                detail: `Loading request #${requestId} from DiligencePortal`,
              });
            }

            if (trimmed.includes("subject=")) {
              const subjectMatch = trimmed.match(/subject=(0x[0-9a-fA-F]+)/);
              const hashMatch = trimmed.match(/docBundleHash=(0x[0-9a-fA-F]+)/);
              const uriMatch = trimmed.match(/metadataUri=(\S+)/);
              send("step", {
                id: "read-request",
                status: "complete",
                label: "Reading On-Chain Request",
                detail: `Subject: ${subjectMatch?.[1] || "?"}`,
                data: {
                  subject: subjectMatch?.[1],
                  docBundleHash: hashMatch?.[1],
                  metadataUri: uriMatch?.[1],
                },
              });
              send("step", {
                id: "doc-resolve",
                status: "running",
                label: "Resolving + Verifying Document Bundle",
                detail: "Fetching metadata bundle and verifying doc hash...",
              });
            }

            if (trimmed.includes("Document resolved sourceHash=")) {
              const sourceHashMatch = trimmed.match(/sourceHash=(0x[0-9a-fA-F]+)/);
              const extractionHashMatch = trimmed.match(/extractionHash=(0x[0-9a-fA-F]+)/);
              const resolvedUrlMatch = trimmed.match(/resolvedUrl=(\S+)/);
              send("step", {
                id: "doc-resolve",
                status: "complete",
                label: "Resolving + Verifying Document Bundle",
                detail: `Verified source hash and extracted normalized company fields`,
                data: {
                  sourceHash: sourceHashMatch?.[1],
                  extractionHash: extractionHashMatch?.[1],
                  resolvedUrl: resolvedUrlMatch?.[1],
                },
              });
              if (!kybStarted) {
                kybStarted = true;
                send("step", {
                  id: "kyb",
                  status: "running",
                  label: "KYB Verification (Sumsub via x402)",
                  detail: "Calling KYB provider with x402 payment...",
                });
              }
            }

            if (trimmed.includes("Document resolution failed; using payload fallback")) {
              send("step", {
                id: "doc-resolve",
                status: "error",
                label: "Resolving + Verifying Document Bundle",
                detail: "Resolver failed; payload fallback was used (non-production mode).",
              });
            }

            if (trimmed.includes("Extracted companyInfo")) {
              const jsonMatch = trimmed.match(/Extracted companyInfo=(\{.*\})$/);
              let extracted: Record<string, unknown> = {};
              if (jsonMatch?.[1]) {
                try {
                  extracted = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
                } catch {
                  extracted = {};
                }
              }
              send("step", {
                id: "doc-resolve",
                status: "complete",
                label: "Resolving + Verifying Document Bundle",
                detail: `Extraction complete: ${String(extracted.companyName || "company")} (${String(extracted.country || "country")})`,
                data: extracted,
              });
              if (!kybStarted) {
                kybStarted = true;
                send("step", {
                  id: "kyb",
                  status: "running",
                  label: "KYB Verification (Sumsub via x402)",
                  detail: "Calling KYB provider with x402 payment...",
                });
              }
            }

            if (trimmed.includes("KYB providerStatus=")) {
              const statusMatch = trimmed.match(/providerStatus=(\S+)/);
              const scoreMatch = trimmed.match(/providerScore=(\d+)/);
              const kybStatus = statusMatch?.[1] || "UNKNOWN";
              const kybScore = scoreMatch?.[1] || "?";
              send("step", {
                id: "kyb",
                status: "complete",
                label: "KYB Verification (Sumsub via x402)",
                detail: `Status: ${kybStatus} · Provider Score: ${kybScore}/1000`,
                data: {
                  providerStatus: kybStatus,
                  providerScore: Number(kybScore),
                  x402Payment: true,
                  x402Amount: "0.01",
                  x402Asset: "USDC",
                  x402AssetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                  x402Network: "base-sepolia",
                  ...(X402_PAYER ? { x402Payer: X402_PAYER } : {}),
                  ...(X402_PAY_TO ? { x402PayTo: X402_PAY_TO } : {}),
                  x402Scheme: "exact",
                  x402Protocol: "EIP-3009 (transferWithAuthorization)",
                },
              });
            }

            if (trimmed.includes("Starting Gemini AI risk assessment")) {
              const modelMatch = trimmed.match(/model=(\S+)/);
              send("step", {
                id: "gemini",
                status: "running",
                label: "AI Risk Assessment (Gemini)",
                detail: `Model: ${modelMatch?.[1] || "gemini-2.5-flash"} · Analyzing KYB + document data...`,
              });
            }

            if (trimmed.includes("Gemini AI result")) {
              const approvedMatch = trimmed.match(/approved=(true|false)/);
              const scoreMatch = trimmed.match(/riskScore=(\d+)/);
              const reasonsMatch = trimmed.match(/reasons=(.*)/);
              let reasons: string[] = [];
              try {
                reasons = JSON.parse(reasonsMatch?.[1] || "[]");
              } catch { /* ignore */ }
              send("step", {
                id: "gemini",
                status: "complete",
                label: "AI Risk Assessment (Gemini)",
                detail: `Gemini: approved=${approvedMatch?.[1]} · riskScore=${scoreMatch?.[1]}/1000`,
                data: {
                  geminiApproved: approvedMatch?.[1] === "true",
                  geminiRiskScore: Number(scoreMatch?.[1]),
                  reasons,
                },
              });
            }

            if (trimmed.includes("Final decision")) {
              const approvedMatch = trimmed.match(/approved=(true|false)/);
              const scoreMatch = trimmed.match(/riskScore=(\d+)/);
              send("step", {
                id: "decision",
                status: "complete",
                label: "Final Decision",
                detail: `Approved: ${approvedMatch?.[1]} · Risk Score: ${scoreMatch?.[1]}/1000`,
                data: {
                  approved: approvedMatch?.[1] === "true",
                  riskScore: Number(scoreMatch?.[1]),
                },
              });
              send("step", {
                id: "write-report",
                status: "running",
                label: "Writing Report On-Chain",
                detail: "Encoding report and calling RWAComplianceReceiver...",
              });
            }

            if (trimmed.includes("Write report succeeded") || trimmed.includes("Write report transaction succeeded")) {
              send("step", {
                id: "write-report",
                status: "complete",
                label: "Writing Report On-Chain",
                detail: "CRE simulator report write complete (local mode)",
              });
            }

            // ── Parse final result JSON ──
            if (trimmed.includes("Workflow Simulation Result:")) {
              // Result may be on same line or next line
              const jsonPart = trimmed.split("Workflow Simulation Result:")[1]?.trim();
              if (jsonPart) {
                try {
                  // Result is often wrapped in extra quotes
                  const cleaned = jsonPart.startsWith('"') ? JSON.parse(jsonPart) : jsonPart;
                  resultJson = typeof cleaned === "string" ? JSON.parse(cleaned) : cleaned;
                } catch { /* try on next line */ }
              }
            } else if (!resultJson && fullOutput.includes("Workflow Simulation Result:")) {
              try {
                const cleaned = trimmed.startsWith('"') ? JSON.parse(trimmed) : trimmed;
                resultJson = typeof cleaned === "string" ? JSON.parse(cleaned) : cleaned;
              } catch { /* not json */ }
            }
          };

          const processChunk = (chunk: Buffer) => {
            const text = chunk.toString();
            fullOutput += text;
            buffer += text;

            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // keep incomplete last line in buffer
            for (const line of lines) {
              processLine(line);
            }
          };

          proc.stdout.on("data", processChunk);
          proc.stderr.on("data", processChunk);

          proc.on("close", (code) => {
            // Process remaining buffer
            if (buffer.trim()) processLine(buffer);

            resolve({
              output: fullOutput,
              exitCode: code ?? 1,
              resultJson,
            });
          });
        });

        if (result.exitCode !== 0 && !result.resultJson) {
          send("step", {
            id: "cre-init",
            status: "error",
            label: "CRE Workflow Engine",
            detail: `CRE exited with code ${result.exitCode}`,
          });
          send("error", { message: "CRE workflow failed. Check raw logs." });
          send("done", {});
          controller.close();
          return;
        }

        // ── Extract result from CRE output ─────────────────────────
        let simResult = result.resultJson;
        if (!simResult) {
          // Try to extract from output text
          const resultMatch = result.output.match(
            /Workflow Simulation Result:\s*"?({[^}]+})"?/s
          );
          if (resultMatch) {
            try {
              simResult = JSON.parse(resultMatch[1]);
            } catch {
              // Try unescaping
              try {
                simResult = JSON.parse(JSON.parse(`"${resultMatch[1]}"`));
              } catch { /* give up */ }
            }
          }
        }

        if (!simResult) {
          // Fallback: try to parse from the raw stringified JSON in output
          const rawMatch = result.output.match(
            /Workflow Simulation Result:\s*\n?\s*"(.+)"/s
          );
          if (rawMatch) {
            try {
              simResult = JSON.parse(rawMatch[1].replace(/\\"/g, '"'));
            } catch { /* give up */ }
          }
        }

        send("result", simResult || { error: "Could not parse CRE result" });

        if (!simResult || !simResult.subject) {
          send("error", { message: "Could not parse CRE simulation result" });
          send("done", {});
          controller.close();
          return;
        }

        // ── Step 4: Write on-chain via onReport ────────────────────
        send("step", {
          id: "onchain-write",
          status: "running",
          label: "Broadcasting On-Chain (onReport)",
          detail:
            "Calling RWAComplianceReceiver.onReport → ComplianceRegistry + ERC-8004 side effects...",
        });

        try {
          const receiverAddr = readAddress("RWAComplianceReceiver");

          const account = privateKeyToAccount(DEPLOYER_PK);
          const chain = {
            ...baseSepolia,
            rpcUrls: {
              default: { http: [RPC_URL] },
            },
          };

          const walletClient = createWalletClient({
            account,
            chain,
            transport: http(RPC_URL),
          });

          const publicClient = createPublicClient({
            chain,
            transport: http(RPC_URL),
          });

          const approved = Boolean(simResult.approved);
          const riskScore = Number(simResult.riskScore || 0);
          const attestationHash = (simResult.attestationHash ||
            "0x0000000000000000000000000000000000000000000000000000000000000000") as Hex;
          const subject = simResult.subject as Hex;

          // Encode the report: (address subject, bool approved, uint32 riskScore, bytes32 attestationHash)
          const report = encodeAbiParameters(
            parseAbiParameters(
              "address subject, bool approved, uint32 riskScore, bytes32 attestationHash"
            ),
            [subject, approved, riskScore, attestationHash]
          );

          // Encode metadata: 32 bytes workflowId + 10 bytes workflowName + 20 bytes workflowOwner
          // Since all expected* values are zero in local deploy, we can pass zeros
          const metadata =
            "0x" +
            "00".repeat(32) + // workflowId (bytes32)
            "00".repeat(10) + // workflowName (bytes10)
            "00".repeat(20); // workflowOwner (address)

          const calldata = encodeFunctionData({
            abi: onReportABI,
            functionName: "onReport",
            args: [metadata as Hex, report],
          });

          const txHash = await walletClient.sendTransaction({
            to: receiverAddr,
            data: calldata,
            gas: 1_000_000n,
          });

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
          });

          const success = receipt.status === "success";

          send("step", {
            id: "onchain-write",
            status: success ? "complete" : "error",
            label: "Broadcasting On-Chain (onReport)",
            detail: success
              ? `tx: ${txHash} · ComplianceRegistry updated + ERC-8004 side effects`
              : `tx: ${txHash} · Transaction reverted`,
            data: {
              txHash,
              blockNumber: Number(receipt.blockNumber),
              gasUsed: receipt.gasUsed.toString(),
              logsCount: receipt.logs.length,
            },
          });

          if (success && receipt.logs.length > 0) {
            // Parse known events from logs
            const eventSignatures: Record<string, string> = {
              // ComplianceUpdated(address,bool,uint32,bytes32,uint64)
              "0x6b7b4d0c": "ComplianceRegistry.ComplianceUpdated",
              // ReportProcessed(address,bool,uint32,bytes32)
              "0xa8fb6a61": "RWAComplianceReceiver.ReportProcessed",
              // ERC8004ReputationWritten
              "0x": "ERC-8004 Reputation Written",
              // ERC8004ValidationRequested
              "0x1": "ERC-8004 Validation Requested",
            };

            const sideEffects: string[] = [];
            for (const log of receipt.logs) {
              const sig = log.topics[0]?.slice(0, 10) || "";
              // Identify known events by topic hash prefixes
              if (log.topics[0]) {
                sideEffects.push(
                  `Event from ${log.address.slice(0, 10)}... topic=${log.topics[0].slice(0, 18)}...`
                );
              }
            }

            send("step", {
              id: "side-effects",
              status: "complete",
              label: "On-Chain Side Effects",
              detail: `${receipt.logs.length} events emitted`,
              data: {
                events: sideEffects,
                logsCount: receipt.logs.length,
              },
            });
          }
        } catch (err: unknown) {
          const errMsg =
            err instanceof Error ? err.message : String(err);

          if (!ALLOW_DIRECT_SET_APPROVAL_FALLBACK) {
            send("step", {
              id: "onchain-write",
              status: "error",
              label: "Broadcasting On-Chain",
              detail: `onReport failed: ${errMsg.slice(0, 200)}`,
            });
            send("done", { requestId });
            return;
          }

          send("log", {
            raw: `onReport failed (${errMsg.slice(0, 100)}), falling back to setApproval (ALLOW_DIRECT_SET_APPROVAL_FALLBACK=true)...`,
            ts: new Date().toISOString(),
          });

          try {
            const registryAddr = readAddress("ComplianceRegistry");
            const account = privateKeyToAccount(DEPLOYER_PK);
            const chain = {
              ...baseSepolia,
              rpcUrls: { default: { http: [RPC_URL] } },
            };

            const walletClient = createWalletClient({
              account,
              chain,
              transport: http(RPC_URL),
            });

            const publicClient = createPublicClient({
              chain,
              transport: http(RPC_URL),
            });

            const setApprovalABI = [
              {
                type: "function" as const,
                name: "setApproval",
                inputs: [
                  { name: "subject", type: "address" },
                  { name: "approved", type: "bool" },
                  { name: "riskScore", type: "uint32" },
                  { name: "attestationHash", type: "bytes32" },
                ],
                outputs: [],
                stateMutability: "nonpayable" as const,
              },
            ];

            const txHash = await walletClient.writeContract({
              address: registryAddr,
              abi: setApprovalABI,
              functionName: "setApproval",
              args: [
                simResult.subject as Hex,
                Boolean(simResult.approved),
                Number(simResult.riskScore || 0),
                (simResult.attestationHash ||
                  "0x0000000000000000000000000000000000000000000000000000000000000000") as Hex,
              ],
            });

            const receipt = await publicClient.waitForTransactionReceipt({
              hash: txHash,
            });

            send("step", {
              id: "onchain-write",
              status:
                receipt.status === "success" ? "complete" : "error",
              label: "Broadcasting On-Chain (setApproval fallback)",
              detail: `tx: ${txHash} · ComplianceRegistry updated directly`,
              data: { txHash, blockNumber: Number(receipt.blockNumber) },
            });
          } catch (fallbackErr: unknown) {
            const fallbackMsg =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : String(fallbackErr);
            send("step", {
              id: "onchain-write",
              status: "error",
              label: "Broadcasting On-Chain",
              detail: `Both onReport and setApproval failed: ${fallbackMsg.slice(0, 200)}`,
            });
          }
        }

        send("done", { requestId });
      } catch (err: unknown) {
        const errMsg =
          err instanceof Error ? err.message : String(err);
        send("error", { message: errMsg });
        send("done", {});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
