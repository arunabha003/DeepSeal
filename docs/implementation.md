# Implementation Status & Deep Dive

This document is organized in two parts:
1. **Table-wise file review** (what exists now and what each file does)
2. **Component deep dive** (how the protocol behaves end-to-end)

---

## 1) Table-Wise File Review

## Smart Contracts (Solidity)

| Contract | File | Status | Description |
|----------|------|--------|-------------|
| **ComplianceRegistry** | `src/ComplianceRegistry.sol` | Complete | Per-address compliance state: `approved`, `riskScore`, `attestationHash`, `updatedAt`. Writable by `owner` or `workflowOperator`. |
| **RWAVault** | `src/RWAVault.sol` | Complete | ERC-4626 vault that enforces compliance on both `msg.sender` and `receiver` at deposit/mint time. |
| **DiligencePortal** | `src/DiligencePortal.sol` | Complete | Stores diligence requests (`subject`, `docBundleHash`, `metadataUri`) and emits `DiligenceRequested`. |
| **RWAComplianceReceiver** | `src/RWAComplianceReceiver.sol` | Complete | CRE report receiver. Validates report metadata, updates compliance, and triggers EAS + ERC-8004 side effects. |
| **DemoUSD** | `src/DemoUSD.sol` | Complete | ERC-20 (6 decimals) test asset used by `RWAVault`. |
| **IdentityRegistry** | `src/erc8004/IdentityRegistry.sol` | Complete | ERC-8004 NFT identity registry for agents. |
| **ReputationRegistry** | `src/erc8004/ReputationRegistry.sol` | Complete | ERC-8004 reputation feedback storage. |
| **ValidationRegistry** | `src/erc8004/ValidationRegistry.sol` | Complete | ERC-8004 validation request/response storage. |

## CRE Workflow

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| **Workflow (main)** | `cre/chainlink-Convergence/my-workflow/main.ts` | Complete (1081 lines) | Full CRE pipeline: HTTP trigger → on-chain read → doc resolution → KYB/x402 → Gemini → on-chain report write. |
| **Config (Anvil)** | `cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json` | Complete | Local Anvil Base Sepolia fork config. |
| **Config (Staging)** | `cre/chainlink-Convergence/my-workflow/config.staging.json` | Complete | Base Sepolia staging config. |
| **Config (Production)** | `cre/chainlink-Convergence/my-workflow/config.production.json` | Complete | Production target config. |
| **Example configs** | `cre/chainlink-Convergence/my-workflow/*.example.json` | Complete | Template configs for user-specific setup. |
| **Project settings** | `cre/chainlink-Convergence/project.yaml` | Complete | Target/RPC mapping for anvil/staging/production. |
| **Workflow docs** | `cre/chainlink-Convergence/my-workflow/README.md` | Complete | Workflow-specific setup and run notes. |

### CRE Workflow Features (Implemented)
- HTTP trigger with `requestId` + optional `companyInfo`
- On-chain request read from `DiligencePortal`
- Metadata document resolution + deterministic extraction hashes
- x402 buyer flow (402 challenge → sign payment → retry)
- Sumsub-backed KYB through provider endpoints
- Gemini risk scoring with model fallback
- `runtime.log()` observability for step-by-step tracing
- On-chain report write path to `RWAComplianceReceiver`

## KYB Provider Service

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| **Server** | `services/kyb-provider/src/server.mjs` | Complete | Express service with Sumsub integration, x402 paywall, and document resolver endpoint. |
| **Sumsub healthcheck** | `services/kyb-provider/src/sumsub-healthcheck.mjs` | Complete | One-shot Sumsub auth probe (`npm run check:sumsub`). |

### Provider Endpoints (Implemented)
- `POST /kyb` — x402-paywalled KYB verification
- `POST /kyb/free` — non-paywalled KYB path (simulation/dev)
- `POST /docs/resolve` — metadata/document resolution for workflow
- `GET /healthz` — service health
- `GET /sumsub/healthz` — Sumsub auth health
- `POST /sumsub/sandbox/testCompleted` — sandbox outcome helper

## Frontend (`app/`)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| **Dashboard** | `app/src/app/page.tsx` | Complete | Protocol summary: request/vault/agent stats + addresses. |
| **Submit Request** | `app/src/app/submit/page.tsx` | Complete | Submits diligence request on-chain to `DiligencePortal`. |
| **Process Workflow** | `app/src/app/process/page.tsx` | Complete | Runs workflow and shows live execution feed/status. |
| **Compliance** | `app/src/app/compliance/page.tsx` | Complete | Address-level compliance lookup from registry. |
| **Vault** | `app/src/app/vault/page.tsx` | Complete | Mint/approve/deposit/withdraw DemoUSD and shares. |
| **Agents** | `app/src/app/agents/page.tsx` | Complete | ERC-8004 agent/reputation/validation views. |
| **Workflow API Route** | `app/src/app/api/workflow/run/route.ts` | Complete | Spawns CRE command, streams logs, then executes receiver write path. |
| **Workflow Monitor** | `app/src/components/workflow-monitor.tsx` | Complete | Stepwise UI for pipeline state and logs. |
| **Web3 Config/ABIs** | `app/src/lib/addresses.ts`, `app/src/lib/abis.ts` | Complete | Contract addresses and ABIs used by wagmi/viem. |

## Scripts (`script/`)

| Script | File | Status | Description |
|--------|------|--------|-------------|
| **Deploy** | `script/Deploy.s.sol` | Complete | Full deployment and wiring of contracts and optional ERC-8004 setup. |
| **SubmitRequest** | `script/SubmitRequest.s.sol` | Complete | Submits a diligence request. |
| **Configure** | `script/Configure.s.sol` | Complete | Owner-side configuration/update actions. |
| **AgentRegister** | `script/AgentRegister.s.sol` | Complete | Registers ERC-8004 agent identity. |
| **GiveFeedback** | `script/GiveFeedback.s.sol` | Complete | Writes reputation feedback. |
| **RequestValidation** | `script/RequestValidation.s.sol` | Complete | Creates validation request. |
| **RespondValidation** | `script/RespondValidation.s.sol` | Complete | Responds to validation request. |
| **ReadERC8004State** | `script/ReadERC8004State.s.sol` | Complete | Reads ERC-8004 state snapshots. |
| **EASRegisterSchema** | `script/EASRegisterSchema.s.sol` | Complete | Registers EAS schema. |
| **EASAttest** | `script/EASAttest.s.sol` | Complete | Creates direct EAS attestation (manual/test). |

## Tests (`test/`)

| Test | File | Status | Coverage Focus |
|------|------|--------|----------------|
| ComplianceRegistry | `test/ComplianceRegistry.t.sol` | Passing | Access control + record updates |
| DiligencePortal | `test/DiligencePortal.t.sol` | Passing | Submit/get/event behavior |
| RWAVault | `test/RWAVault.t.sol` | Passing | Compliance gating on vault entry |
| RWAComplianceReceiver | `test/RWAComplianceReceiver.t.sol` | Passing | Report ingest + checks |
| RWAComplianceReceiverERC8004 | `test/RWAComplianceReceiverERC8004.t.sol` | Passing | ERC-8004 side effects |
| IdentityRegistry | `test/erc8004/IdentityRegistry.t.sol` | Passing | Agent identity NFT behavior |
| ReputationRegistry | `test/erc8004/ReputationRegistry.t.sol` | Passing | Feedback flow |
| ValidationRegistry | `test/erc8004/ValidationRegistry.t.sol` | Passing | Validation request/response flow |

## Tools (`tools/`)

| Tool | File | Description |
|------|------|-------------|
| Readiness check | `tools/readiness-check.mjs` | Verifies config, code deployment, and provider health. |
| Sync CRE config | `tools/sync-cre-config.mjs` | Syncs contract addresses into workflow config. |
| Sync local secrets | `tools/sync-local-secrets-to-config.mjs` | Mirrors local `.env` secrets into config fallback fields. |
| Process request CLI | `tools/process-request.mjs` | CLI wrapper for running request flow. |
| Hash doc bundle | `tools/hash-doc-bundle.mjs` | Computes deterministic document bundle hash. |
| KYB stub | `tools/kyb-stub/server.mjs` | Stubbed KYB service for isolated testing. |

## Core Documentation

| Document | File | Description |
|----------|------|-------------|
| Main project readme | `README.md` | End-to-end project setup and usage overview. |
| Implementation guide | `docs/implementation.md` | File review + deep-dive (this doc). |
| Anvil e2e runbook | `docs/anvil-base-sepolia-e2e.md` | Local fork execution runbook. |
| Base Sepolia runbook | `docs/base-sepolia-deployment.md` | Live testnet deployment/runbook. |
| Sample upload bundle | `docs/acme-company-bundle.upload.json` | Example document bundle payload for IPFS upload. |

---

## 2) Component Deep Dive

### 2.1 DiligencePortal

`DiligencePortal` is the request anchor contract. Every diligence request is created on-chain with three immutable references: the subject address, a bundle hash, and a metadata URI. This gives the workflow a deterministic source of truth and an auditable request history keyed by `requestId`.

### 2.2 ComplianceRegistry

`ComplianceRegistry` is the canonical gate state for the protocol. It stores whether an address is approved, the current risk score, and an attestation hash. Vault eligibility depends on this state, not on frontend logic or off-chain assumptions.

### 2.3 RWAComplianceReceiver

`RWAComplianceReceiver` is the main integration point for CRE results. It receives encoded report data and fans out protocol side effects in one transaction:
- compliance update,
- EAS attestation (when configured),
- ERC-8004 reputation writes,
- ERC-8004 validation request/response artifacts.

This keeps state transitions atomic and easier to verify operationally.

### 2.4 RWAVault (ERC-4626)

`RWAVault` is a standards-based vault over `DemoUSD`. It checks compliance status before allowing mint/deposit. Because it depends on the registry, eligibility policy can evolve at the workflow/registry layer while the vault remains minimal and deterministic.

### 2.5 Chainlink CRE Workflow

`main.ts` is the orchestration layer. It ties contract reads, external HTTP calls, AI scoring, and report writes into a single run.

Current runtime path:
1. Receive trigger payload with `requestId`.
2. Read request from `DiligencePortal`.
3. Resolve and parse metadata/doc bundle.
4. Run KYB against provider (`/kyb/free` or `/kyb` with x402).
5. Run Gemini analysis.
6. Merge decisions and compute final report fields.
7. Write report to on-chain receiver path.

The workflow is observable via `runtime.log()` and exposed to the frontend processing page through streaming output.

### 2.6 KYB Provider + Sumsub

The KYB provider wraps Sumsub access, request signing, and status mapping. In paid mode, it enforces x402 before returning KYB results. In free mode, it exposes the same verification logic without payment challenge for local simulation convenience.

### 2.7 x402 Payment Rail

For `POST /kyb` paid flow:
1. Client sends request without payment proof.
2. Provider returns `402` with accepted payment requirements.
3. Workflow/buyer signs EIP-3009 authorization.
4. Client retries with `X-PAYMENT`.
5. Provider verifies and settles payment, then executes KYB.

This makes KYB usage metered and machine-payable.

### 2.8 Gemini Risk Scoring

Gemini receives structured business context and KYB outputs, then returns a machine-readable risk verdict (`approved`, score, reasons). Workflow-side fallback logic handles unavailable model cases and keeps processing resilient.

### 2.9 ERC-8004 Layer

The protocol tracks agent trust artifacts using ERC-8004 registries:
- identity (who the agent is),
- reputation (how it performed),
- validation (what was requested/responded).

Receiver automation ensures these records are updated as part of normal report processing rather than as optional manual tasks.

### 2.10 EAS Attestation Layer

EAS stores a protocol-independent attestation of final compliance decision. This creates a second verifiable surface outside custom contracts and improves interoperability with external indexers and attestation-native consumers.

### 2.11 Frontend + API Processing Layer

The frontend is not just a form UI; it is also the operator console. Submit, process, compliance, vault, and agents pages are wired to live on-chain/off-chain state. The process route streams workflow logs so operators can inspect failure points quickly.

---


## Known Constraints / Workarounds

- Local CRE simulation may show non-final tx hash values in logs; validate state through on-chain reads.
- If CRE linked secrets are unavailable in an org, local config fallback tooling is used.
- On Base Sepolia fork mode, EIP-7702 delegated account code may need clearing before x402 USDC signature paths.
- Sumsub sandbox outcomes can require explicit sandbox transition APIs for deterministic demo paths.

