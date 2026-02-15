# Confidential RWA Due‑Diligence Vault

ERC‑4626 vault gated by an onchain compliance registry, intended to be driven by a Chainlink CRE workflow that performs KYB/KYC checks + LLM risk analysis and then writes approvals onchain.

## What’s in this repo (so far)
- `src/ComplianceRegistry.sol`: stores per-address approvals + riskScore + attestationHash; updates allowed by `owner` or `workflowOperator`.
- `src/RWAVault.sol`: ERC‑4626 vault that blocks `deposit/mint` unless **both** caller and receiver are approved in `ComplianceRegistry`.
- `src/DemoUSD.sol`: demo underlying ERC‑20 (6 decimals) for local/testnet demos.
- `src/erc8004/*`: ERC‑8004 Identity/Reputation/Validation registries (agent reputation primitives).
- `script/Deploy.s.sol`: deploys `DemoUSD`, `ComplianceRegistry`, `RWAVault`, plus ERC‑8004 registries.
- `script/Configure.s.sol`: manually sets approval on the registry (useful until CRE workflow is wired).
- ERC‑8004 helper scripts:
  - `script/AgentRegister.s.sol`
  - `script/GiveFeedback.s.sol`
  - `script/RequestValidation.s.sol`
  - `script/RespondValidation.s.sol`

## Build & test
```bash
forge build
forge test
```

## Sepolia demo
Runbook: `docs/sepolia-demo.md`.

## Local deploy (anvil)
Terminal 1:
```bash
anvil
```

Terminal 2:
```bash
export PRIVATE_KEY=0xYOUR_ANVIL_KEY
export CRE_REPORT_FORWARDER=0x0000000000000000000000000000000000000000 # optional; 0 allows direct calls
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

## Manual approve (until CRE is wired)
```bash
export PRIVATE_KEY=0xYOUR_KEY
export REGISTRY_ADDRESS=0x...
export SUBJECT=0x...
export APPROVED=true
export RISK_SCORE=42
export ATTESTATION_HASH=0x0000000000000000000000000000000000000000000000000000000000000000
forge script script/Configure.s.sol:Configure --rpc-url http://127.0.0.1:8545 --broadcast
```

## KYB provider (x402-ready) + real Gemini (dev runner)
Until you pick a real KYB/KYC provider, there’s a minimal local KYB service and a runner script that:
1) reads a diligence request from `DiligencePortal`
2) calls the KYB endpoint (free route by default; x402 can be enabled on `/kyb`)
3) calls Gemini for risk JSON
4) writes the decision to `RWAComplianceReceiver.onReport(...)` (which updates `ComplianceRegistry`)

Terminal 1:
```bash
cd services/kyb-provider
npm install
npm run dev
```

Terminal 2 (example):
```bash
export RPC_URL=http://127.0.0.1:8545
export PRIVATE_KEY=0xYOUR_ANVIL_KEY
export PORTAL_ADDRESS=0x...
export RECEIVER_ADDRESS=0x...
export REQUEST_ID=1
export GEMINI_API_KEY=...
node tools/process-request.mjs
```

Notes:
- CRE workflow configs default `kybUrl` to `http://127.0.0.1:3001/kyb/free`.
- To enable x402 on `POST /kyb`, set `X402_ENABLED=true` in `services/kyb-provider/.env` (see `.env.example`).

## EAS (optional audit trail)
Register a schema (once) and create an attestation for a diligence decision.

```bash
export PRIVATE_KEY=0xYOUR_KEY
export EAS_SCHEMA_REGISTRY=0x...
export EAS_SCHEMA='address subject,bool approved,uint32 riskScore,bytes32 attestationHash,uint64 timestamp'
forge script script/EASRegisterSchema.s.sol:EASRegisterSchema --rpc-url <RPC> --broadcast
```

```bash
export PRIVATE_KEY=0xYOUR_KEY
export EAS_ATTESTATION_CONTRACT=0x...
export EAS_SCHEMA_UID=0x...
export EAS_RECIPIENT=0xSUBJECT   # typically attest to the subject itself
export SUBJECT=0x...
export APPROVED=true
export RISK_SCORE=42
export ATTESTATION_HASH=0x...
forge script script/EASAttest.s.sol:EASAttest --rpc-url <RPC> --broadcast
```

## CRE receiver configuration (optional hardening)
`RWAComplianceReceiver` can restrict who can call `onReport` and optionally validate workflow identity fields.

- Allow only a specific forwarder:
  - Deploy with `CRE_REPORT_FORWARDER=<address>` (or set later via `setForwarder(address)` as the owner)
- Optionally pin expected workflow identity (set on deploy or later via `setExpectedWorkflow(bytes32,address,bytes10)`):
  - `CRE_WORKFLOW_ID` (bytes32)
  - `CRE_WORKFLOW_AUTHOR` (address)
  - `CRE_WORKFLOW_NAME` (bytes10)
