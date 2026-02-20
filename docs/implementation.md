# Implementation Status

This document tracks what's implemented in the Confidential RWA Due-Diligence Vault protocol.

## Smart Contracts (Solidity)

| Contract | File | Status | Description |
|----------|------|--------|-------------|
| **ComplianceRegistry** | `src/ComplianceRegistry.sol` |  Complete | Per-address compliance state: `approved`, `riskScore`, `attestationHash`, `updatedAt`. Writable by `owner` or `workflowOperator`. |
| **RWAVault** | `src/RWAVault.sol` |  Complete | ERC-4626 vault that enforces compliance on both `msg.sender` AND `receiver` at deposit time. |
| **DiligencePortal** | `src/DiligencePortal.sol` |  Complete | Stores diligence requests (subject, docBundleHash, metadataUri). Emits `DiligenceRequested` events. |
| **RWAComplianceReceiver** | `src/RWAComplianceReceiver.sol` |  Complete | CRE report receiver. Validates workflow identity from metadata. Calls `ComplianceRegistry.setApproval()`, triggers EAS attestation, and writes ERC-8004 reputation + validation artifacts. 8–9 events per call. |
| **DemoUSD** | `src/DemoUSD.sol` |  Complete | ERC-20 stablecoin (6 decimals) with public `mint()` for testing. |
| **IdentityRegistry** | `src/erc8004/IdentityRegistry.sol` |  Complete | ERC-8004 NFT-based agent identity. ERC-721 + URIStorage + metadata + agentWallet verification. |
| **ReputationRegistry** | `src/erc8004/ReputationRegistry.sol` |  Complete | ERC-8004 feedback registry. Numerical scores per agent with tag-based categorization. |
| **ValidationRegistry** | `src/erc8004/ValidationRegistry.sol` |  Complete | ERC-8004 validation request/response pairs. Score-based validation with auto-respond capability. |

## CRE Workflow

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| **Workflow (main)** | `cre/chainlink-Convergence/my-workflow/main.ts` |  Complete (866 lines) | Full CRE SDK workflow: HTTP trigger → on-chain read → KYB (Sumsub/x402) → Gemini AI → on-chain writeReport |
| **Config (Anvil)** | `cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json` |  Complete | Local Anvil fork config. API key loaded from `.env` (not hardcoded). |
| **Config (Staging)** | `cre/chainlink-Convergence/my-workflow/config.staging.json` |  Complete | Base Sepolia staging config. |
| **Config (Production)** | `cre/chainlink-Convergence/my-workflow/config.production.json` |  Complete | Production config. |
| **Project settings** | `cre/chainlink-Convergence/project.yaml` |  Complete | RPC targets for anvil/staging/production. |
| **Exported ABIs** | `cre/abi/*.json` |  Complete | DiligencePortal, ComplianceRegistry, RWAComplianceReceiver ABIs. |

### CRE Workflow Features
- HTTP trigger with `requestId` + optional `companyInfo`
- Reads request from `DiligencePortal` via `EVMClient`
- x402 micropayment buyer flow (both standard HTTP and Confidential HTTP paths)
- Sumsub KYB verification (real Sandbox API)
- Google Gemini AI risk scoring with model fallback logic
- `runtime.log()` calls for observable step visibility
- Consensus aggregation support (`identical`, `median`)
- Writes report on-chain via `EVMClient.writeReport`

## KYB Provider (services/kyb-provider)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| **Server** | `services/kyb-provider/src/server.mjs` |  Complete | Express.js microservice with Sumsub integration and x402 paywall. |
| **Sumsub healthcheck** | `services/kyb-provider/src/sumsub-healthcheck.mjs` |  Complete | One-shot Sumsub auth probe (`npm run check:sumsub`). |
| **Force-approve mode** | `FORCE_APPROVE=true` in `.env` |  Complete | Bypass Sumsub, return APPROVED (demo/hackathon mode). |

### KYB Endpoints
- `POST /kyb` — x402 paywalled KYB verification
- `POST /kyb/free` — Free KYB verification (for CRE simulation)
- `GET /healthz` — Server health check
- `GET /sumsub/healthz` — Sumsub auth validation
- `POST /sumsub/sandbox/testCompleted` — Force sandbox applicant to GREEN/RED

## Frontend (app/)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| **Dashboard** | `app/src/app/page.tsx` |  Complete | Overview: request count, vault TVL, agent count, contract addresses |
| **Submit Request** | `app/src/app/submit/page.tsx` |  Complete | Submit to DiligencePortal + link to Process page |
| **Process Workflow** | `app/src/app/process/page.tsx` |  Complete | CRE workflow execution with real-time SSE streaming |
| **Compliance** | `app/src/app/compliance/page.tsx` |  Complete | Lookup compliance status by address |
| **Vault** | `app/src/app/vault/page.tsx` |  Complete | Mint/approve/deposit/withdraw dUSD + vault shares |
| **Agents** | `app/src/app/agents/page.tsx` |  Complete | Browse ERC-8004 agents, register, feedback, validation |
| **SSE API Route** | `app/src/app/api/workflow/run/route.ts` |  Complete | Spawns CRE CLI, streams stdout, calls onReport() on-chain |
| **Workflow Monitor** | `app/src/components/workflow-monitor.tsx` |  Complete | 10-step pipeline UI with data cards and raw logs |
| **Navigation** | `app/src/components/nav.tsx` |  Complete | Dark theme nav with all page links |
| **UI Components** | `app/src/components/ui.tsx` |  Complete | Card, Button, Badge, StatusDot primitives |
| **Addresses** | `app/src/lib/addresses.ts` |  Auto-generated | Contract addresses from deploy |
| **ABIs** | `app/src/lib/abis.ts` |  Complete | All contract ABIs for wagmi |

## Scripts

| Script | File | Status | Description |
|--------|------|--------|-------------|
| **Deploy** | `script/Deploy.s.sol` |  Complete | Full deploy: all contracts + ERC-8004 setup + receiver wiring |
| **SubmitRequest** | `script/SubmitRequest.s.sol` |  Complete | Submit a test diligence request |
| **Configure** | `script/Configure.s.sol` |  Complete | Manual compliance override (break-glass) |
| **AgentRegister** | `script/AgentRegister.s.sol` |  Complete | Register ERC-8004 agent |
| **GiveFeedback** | `script/GiveFeedback.s.sol` |  Complete | Give reputation feedback |
| **RequestValidation** | `script/RequestValidation.s.sol` |  Complete | Request agent validation |
| **RespondValidation** | `script/RespondValidation.s.sol` |  Complete | Respond to validation request |
| **ReadERC8004State** | `script/ReadERC8004State.s.sol` |  Complete | Read all ERC-8004 state |
| **EASRegisterSchema** | `script/EASRegisterSchema.s.sol` |  Complete | Register EAS attestation schema |
| **EASAttest** | `script/EASAttest.s.sol` |  Complete | Create EAS attestation |

## Tests

| Test | File | Status | Coverage |
|------|------|--------|----------|
| **ComplianceRegistry** | `test/ComplianceRegistry.t.sol` |  7 tests | Owner/operator access, setApproval, edge cases |
| **RWAVault** | `test/RWAVault.t.sol` |  5 tests | Compliance gate on deposit/mint, dual-check |
| **DiligencePortal** | `test/DiligencePortal.t.sol` |  Passing | Submit, getRequest, events |
| **RWAComplianceReceiver** | `test/RWAComplianceReceiver.t.sol` |  Passing | onReport, forwarder validation, identity checks |
| **RWAComplianceReceiverERC8004** | `test/RWAComplianceReceiverERC8004.t.sol` |  Passing | ERC-8004 side effect automation |
| **IdentityRegistry** | `test/erc8004/IdentityRegistry.t.sol` |  Passing | Register, metadata, agentWallet |
| **ReputationRegistry** | `test/erc8004/ReputationRegistry.t.sol` |  Passing | Feedback, revocation, responses |
| **ValidationRegistry** | `test/erc8004/ValidationRegistry.t.sol` |  Passing | Request/response pairs, authorization |

## Tools

| Tool | File | Description |
|------|------|-------------|
| `tools/readiness-check.mjs` | Validates CRE config addresses + deployed code + KYB provider health |
| `tools/sync-cre-config.mjs` | Updates CRE config from Foundry deploy broadcast |
| `tools/sync-local-secrets-to-config.mjs` | Copies `.env` keys into config (for orgs without CRE `link-key`) |
| `tools/process-request.mjs` | CLI-based request processor (alternative to frontend) |
| `tools/kyb-stub/server.mjs` | Stub KYB server for offline testing |

## Documentation

| Document | File | Description |
|----------|------|-------------|
| `README.md` | Project overview + Chainlink file links |
| `docs/architecture.md` | Full system architecture with diagrams |
| `docs/presentation.html` | Hackathon presentation (interactive HTML) |
| `docs/architecture-diagram.html` | Visual architecture diagram (interactive HTML) |
| `docs/anvil-base-sepolia-e2e.md` | Complete Anvil fork setup guide |
| `docs/base-sepolia-deployment.md` | End-to-end Base Sepolia deployment and simulation runbook |
| `docs/implementation.md` | This file |
| `docs/sumsub-setup.md` | Sumsub sandbox setup instructions |
| `cre/README.md` | CRE workflow setup + simulation instructions |

## Known Issues / Workarounds

- **Sumsub sandbox always returns REJECTED** → Set `FORCE_APPROVE=true` in `services/kyb-provider/.env` for demos
- **CRE local simulator doesn't broadcast** → Frontend API route calls `onReport()` directly after simulation
- **EIP-7702 delegation on Anvil forks** → Clear with `anvil_setCode(<address>, "0x")` before x402 runs
- **CRE `link-key` access required for secrets** → Use config fallbacks or `.env` file
- **CRE `writeReport` may return zero tx hash** → Validate by reading `ComplianceRegistry.getRecord(subject)` after
