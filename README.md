# Confidential RWA Due‑Diligence Vault

> **Hackathon submission for Chainlink CRE (Compute Runtime Environment)**

An ERC‑4626 vault gated by an onchain compliance registry, driven by a **Chainlink CRE workflow** that performs KYB/KYC checks (Sumsub via x402 micropayments) + LLM risk analysis (Google Gemini) and writes approvals on-chain — with automated ERC-8004 agent reputation and validation side effects.



## 📁 Chainlink CRE Files

| File | Description |
|------|-------------|
| [`cre/chainlink-Convergence/my-workflow/main.ts`](cre/chainlink-Convergence/my-workflow/main.ts) | **CRE Workflow** — 866-line TypeScript workflow: reads on-chain request → calls KYB provider (x402) → calls Gemini AI → writes compliance report on-chain |
| [`cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json`](cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json) | CRE workflow config for local Anvil fork simulation |
| [`cre/chainlink-Convergence/project.yaml`](cre/chainlink-Convergence/project.yaml) | CRE project settings (RPC targets for anvil/staging/production) |
| [`cre/chainlink-Convergence/secrets.yaml`](cre/chainlink-Convergence/secrets.yaml) | CRE secrets configuration |
| [`cre/README.md`](cre/README.md) | CRE workflow setup and simulation instructions |
| [`src/RWAComplianceReceiver.sol`](src/RWAComplianceReceiver.sol) | On-chain receiver for CRE `writeReport` — validates workflow identity, updates ComplianceRegistry, triggers ERC-8004 side effects |
| [`src/ComplianceRegistry.sol`](src/ComplianceRegistry.sol) | Compliance state (approved/riskScore/attestation) — written by CRE workflow, read by vault |
| [`src/RWAVault.sol`](src/RWAVault.sol) | ERC-4626 vault with compliance gate — deposits blocked unless `isApproved()` |
| [`services/kyb-provider/src/server.mjs`](services/kyb-provider/src/server.mjs) | KYB microservice (Sumsub + x402 paywall) — called by CRE workflow |
| [`app/src/app/api/workflow/run/route.ts`](app/src/app/api/workflow/run/route.ts) | Next.js SSE API route — spawns CRE CLI, streams steps to browser, writes on-chain |

