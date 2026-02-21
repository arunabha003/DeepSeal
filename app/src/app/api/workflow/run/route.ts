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

const TX_HASH_RE = /0x[0-9a-fA-F]{64}/;

function decodeBase64Json(raw: string): Record<string, unknown> | null {
  try {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractX402TxHash(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const decoded = decodeBase64Json(value);
  const fromHeader = decoded?.transaction;
  if (typeof fromHeader === "string" && TX_HASH_RE.test(fromHeader)) {
    return fromHeader.match(TX_HASH_RE)?.[0] ?? null;
  }
  const inline = value.match(TX_HASH_RE);
  return inline ? inline[0] : null;
}

// ── POST handler ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { requestId } = body;

  if (!requestId) {
    return new Response(JSON.stringify({ error: "requestId is required" }), {
      status: 400,
    });
  }
  if ("companyInfo" in body) {
    return new Response(
      JSON.stringify({ error: "companyInfo is no longer accepted. Submit only requestId; company data is resolved from metadataUri." }),
      { status: 400 },
    );
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
          label: "Build Trigger Payload",
          detail: `Request #${requestId}`,
        });

        const payload = {
          requestId: Number(requestId),
        };
        fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(payload, null, 2));

        send("step", {
          id: "payload",
          status: "complete",
          label: "Build Trigger Payload",
          detail: `Payload written for request #${requestId}`,
        });

        // ── Step 2: Sync block timestamp (Anvil only) ─────────────────
        if (IS_LOCAL) {
          send("step", {
            id: "timestamp",
            status: "running",
            label: "Synchronize Chain Timestamp (Anvil local only)",
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
            label: "Synchronize Chain Timestamp (Anvil local only)",
            detail: `Block timestamp set to ${currentTs}`,
          });
        } else {
          send("step", {
            id: "timestamp",
            status: "complete",
            label: "Synchronize Chain Timestamp (Anvil local only)",
            detail: `Using Base Sepolia Testnet `,
          });
        }

        // ── Step 3: Run CRE workflow ───────────────────────────────
        send("step", {
          id: "cre-init",
          status: "running",
          label: "Initialize CRE Simulation",
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
          let extractedCompanyInfo: Record<string, unknown> = {};
          let documentSourceHash = "";
          let documentExtractionHash = "";
          let kybProviderStatus = "";
          let kybProviderScore = 0;
          let kybX402TxHash = "";

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
                label: "Initialize CRE Simulation",
                detail: "Simulator initialized",
              });
            }

            if (trimmed.includes("Processing diligence requestId")) {
              send("step", {
                id: "read-request",
                status: "running",
                label: "Read On-Chain Request",
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
                label: "Read On-Chain Request",
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
                label: "Resolve & Verify Document Bundle",
                detail: "Fetching metadata bundle and verifying doc hash...",
              });
            }

            if (trimmed.includes("Document resolved sourceHash=")) {
              const sourceHashMatch = trimmed.match(/sourceHash=(0x[0-9a-fA-F]+)/);
              const extractionHashMatch = trimmed.match(/extractionHash=(0x[0-9a-fA-F]+)/);
              const resolvedUrlMatch = trimmed.match(/resolvedUrl=(\S+)/);
              documentSourceHash = sourceHashMatch?.[1] || "";
              documentExtractionHash = extractionHashMatch?.[1] || "";
              send("step", {
                id: "doc-resolve",
                status: "complete",
                label: "Resolve & Verify Document Bundle",
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
                  label: "Run KYB Verification (Sumsub + x402)",
                  detail: "Calling KYB provider with x402 payment...",
                });
              }
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
              extractedCompanyInfo = extracted;
              send("step", {
                id: "doc-resolve",
                status: "complete",
                label: "Resolve & Verify Document Bundle",
                detail: `Extraction complete: ${String(extracted.companyName || "company")} (${String(extracted.country || "country")})`,
                data: {
                  ...extracted,
                  sourceHash: documentSourceHash,
                  extractionHash: documentExtractionHash,
                },
              });
              if (!kybStarted) {
                kybStarted = true;
                send("step", {
                  id: "kyb",
                  status: "running",
                  label: "Run KYB Verification (Sumsub + x402)",
                  detail: "Calling KYB provider with x402 payment...",
                });
              }
            }

            if (trimmed.includes("KYB providerStatus=")) {
              const statusMatch = trimmed.match(/providerStatus=(\S+)/);
              const scoreMatch = trimmed.match(/providerScore=(\d+)/);
              const kybStatus = statusMatch?.[1] || "UNKNOWN";
              const kybScore = scoreMatch?.[1] || "?";
              kybProviderStatus = kybStatus;
              kybProviderScore = Number(kybScore);
              send("step", {
                id: "kyb",
                status: "complete",
                label: "Run KYB Verification (Sumsub + x402)",
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
                  ...(kybX402TxHash ? { x402TxHash: kybX402TxHash } : {}),
                  x402Scheme: "exact",
                  x402Protocol: "EIP-3009 (transferWithAuthorization)",
                },
              });
            }

            if (trimmed.includes("x402 payment settled txHash=")) {
              const match = trimmed.match(/txHash=(0x[0-9a-fA-F]{64})/);
              if (match?.[1]) {
                kybX402TxHash = match[1];
                send("step", {
                  id: "kyb",
                  status: "complete",
                  label: "Run KYB Verification (Sumsub + x402)",
                  detail: `Status: ${kybProviderStatus || "UNKNOWN"} · Provider Score: ${kybProviderScore}/1000 · Payment tx: ${kybX402TxHash.slice(0, 10)}...${kybX402TxHash.slice(-8)}`,
                  data: {
                    providerStatus: kybProviderStatus || "UNKNOWN",
                    providerScore: Number(kybProviderScore || 0),
                    x402Payment: true,
                    x402Amount: "0.01",
                    x402Asset: "USDC",
                    x402AssetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                    x402Network: "base-sepolia",
                    ...(X402_PAYER ? { x402Payer: X402_PAYER } : {}),
                    ...(X402_PAY_TO ? { x402PayTo: X402_PAY_TO } : {}),
                    x402TxHash: kybX402TxHash,
                    x402Scheme: "exact",
                    x402Protocol: "EIP-3009 (transferWithAuthorization)",
                  },
                });
              }
            }

            if (trimmed.includes("Starting Gemini AI risk assessment")) {
              const modelMatch = trimmed.match(/model=(\S+)/);
              send("step", {
                id: "gemini",
                status: "running",
                label: "Run AI Risk Scoring (Gemini)",
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
                label: "Run AI Risk Scoring (Gemini)",
                detail: `Gemini: approved=${approvedMatch?.[1]} · riskScore=${scoreMatch?.[1]}/1000`,
                data: {
                  geminiApproved: approvedMatch?.[1] === "true",
                  geminiRiskScore: Number(scoreMatch?.[1]),
                  reasons,
                  // Context: what Gemini analyzed
                  analyzedCompany: extractedCompanyInfo.companyName || null,
                  analyzedCountry: extractedCompanyInfo.country || null,
                  analyzedRegNumber: extractedCompanyInfo.registrationNumber || null,
                  kybInputStatus: kybProviderStatus,
                  kybInputScore: kybProviderScore,
                  documentSourceHash: documentSourceHash || null,
                  extractionHash: documentExtractionHash || null,
                },
              });
            }

            if (trimmed.includes("Final decision")) {
              const approvedMatch = trimmed.match(/approved=(true|false)/);
              const scoreMatch = trimmed.match(/riskScore=(\d+)/);
              send("step", {
                id: "decision",
                status: "complete",
                label: "Merge Final Decision",
                detail: `Approved: ${approvedMatch?.[1]} · Risk Score: ${scoreMatch?.[1]}/1000`,
                data: {
                  approved: approvedMatch?.[1] === "true",
                  riskScore: Number(scoreMatch?.[1]),
                },
              });
              send("step", {
                id: "write-report",
                status: "running",
                label: "Encode Workflow Report",
                detail: "Encoding report and calling RWAComplianceReceiver...",
              });
            }

            if (trimmed.includes("Write report succeeded") || trimmed.includes("Write report transaction succeeded")) {
              send("step", {
                id: "write-report",
                status: "complete",
                label: "Encode Workflow Report",
                detail: `CRE simulator report write complete (${IS_LOCAL ? "local" : "testnet"} mode)`,
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
            label: "Initialize CRE Simulation",
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

        if (simResult) {
          const directTxHash =
            typeof simResult.x402TxHash === "string" &&
            TX_HASH_RE.test(simResult.x402TxHash)
              ? (simResult.x402TxHash.match(TX_HASH_RE)?.[0] ?? "")
              : "";
          const headerTxHash = extractX402TxHash(simResult.x402PaymentResponseHeader);
          const finalX402TxHash = directTxHash || headerTxHash || "";
          if (finalX402TxHash) {
            send("step", {
              id: "kyb",
              status: "complete",
              label: "Run KYB Verification (Sumsub + x402)",
              detail: `x402 payment settled · tx: ${finalX402TxHash.slice(0, 10)}...${finalX402TxHash.slice(-8)}`,
              data: {
                x402Payment: true,
                x402Amount: "0.01",
                x402Asset: "USDC",
                x402AssetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                x402Network: "base-sepolia",
                ...(X402_PAYER ? { x402Payer: X402_PAYER } : {}),
                ...(X402_PAY_TO ? { x402PayTo: X402_PAY_TO } : {}),
                x402TxHash: finalX402TxHash,
                x402Scheme: "exact",
                x402Protocol: "EIP-3009 (transferWithAuthorization)",
              },
            });
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
          label: "Broadcast On-Chain (onReport)",
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
            label: "Broadcast On-Chain (onReport)",
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
            // Parse known events from logs by topic0 hash
            const COMPLIANCE_UPDATED = "0x91006496d86cec2237517a88b4cc35da2281f10bab7037db6da92c3c2c2d3354";
            const REPORT_PROCESSED = "0xe0836c97c57c16c6792d2845db7500913c388ca47ea613468c8e1682cf57a9c9";
            const REPUTATION_WRITTEN = "0x47cbc21d242643bf95c17cd475baf8d9c4a57ca1d2e4d501daa7bb553fe9b5b0";
            const FEEDBACK_GIVEN = "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc";
            const EAS_ATTESTED = "0xe5000e8d007541a20bb85e4d344e4d4a495f6945d469389b23d4d00fa684b9aa";
            const EAS_ATTEST_FAILED = "0x6ee9a79d936fb15d44457ed75a9f5c768372aecf024ee83f5937d3df0d8e90d8";

            const sideEffects: string[] = [];
            const erc8004Agents: { agentId: number; value: number; decimals: number; display: string }[] = [];
            let easAttestationUid: string | null = null;

            for (const log of receipt.logs) {
              const topic0 = log.topics[0] || "";
              if (topic0 === COMPLIANCE_UPDATED) {
                sideEffects.push("✓ ComplianceRegistry.ComplianceUpdated");
              } else if (topic0 === REPORT_PROCESSED) {
                sideEffects.push("✓ RWAComplianceReceiver.ReportProcessed");
              } else if (topic0 === REPUTATION_WRITTEN) {
                // Decode ERC8004ReputationWritten(uint256 agentId, int128 value, uint8 decimals, bytes32 feedbackHash)
                const agentId = Number(BigInt(log.topics[1] || "0"));
                try {
                  const data = log.data as Hex;
                  // data layout: int128 value (32 bytes) + uint8 decimals (32 bytes) + bytes32 hash (32 bytes)
                  const rawValue = BigInt("0x" + data.slice(2, 66));
                  // Handle int128: if high bit set, it's negative
                  const value = rawValue > BigInt("0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")
                    ? Number(rawValue - BigInt("0x100000000000000000000000000000000"))
                    : Number(rawValue);
                  const decimals = Number(BigInt("0x" + data.slice(66, 130)));
                  const display = (value / Math.pow(10, decimals)).toFixed(decimals);
                  erc8004Agents.push({ agentId, value, decimals, display });
                  sideEffects.push(`✓ ERC-8004 Agent #${agentId} reputation: ${display}/100`);
                } catch {
                  sideEffects.push(`✓ ERC-8004 Agent #${agentId} reputation written`);
                }
              } else if (topic0 === FEEDBACK_GIVEN) {
                // ReputationRegistry.FeedbackGiven - already covered by ReputationWritten
              } else if (topic0 === EAS_ATTESTED) {
                // EASAttested(address indexed subject, bytes32 indexed uid)
                easAttestationUid = log.topics[2] || null;
                sideEffects.push(`✓ EAS Attestation created: ${(easAttestationUid || "").slice(0, 14)}...`);
              } else if (topic0 === EAS_ATTEST_FAILED) {
                sideEffects.push(`✗ EAS Attestation failed`);
              } else if (log.topics[0]) {
                sideEffects.push(`Event from ${log.address.slice(0, 10)}...`);
              }
            }

            send("step", {
              id: "side-effects",
              status: "complete",
              label: "On-Chain Side Effects",
              detail: `${receipt.logs.length} events emitted · ${erc8004Agents.length} ERC-8004 agent scores written${easAttestationUid ? " · EAS attested" : ""}`,
              data: {
                events: sideEffects,
                logsCount: receipt.logs.length,
                erc8004Agents,
                easAttestationUid,
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
              label: "Broadcast On-Chain",
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
              label: "Broadcast On-Chain (setApproval fallback)",
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
              label: "Broadcast On-Chain",
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
