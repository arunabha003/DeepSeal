# DeepSeal

<p align="center">
  <strong>Confidential RWA Due-Diligence Vault</strong><br/>
  Chainlink CRE · x402 · EAS · ERC-8004 · ERC-4626
</p>

<p align="center">
  <a href="https://github.com/arunabha003/Chainlink-Convergence"><img src="https://img.shields.io/badge/GitHub-Repository-181717?logo=github" /></a>
  <img src="https://img.shields.io/badge/Chain-Base%20Sepolia-0052FF?logo=coinbase" />
  <img src="https://img.shields.io/badge/Workflow-Chainlink%20CRE-375BD2" />
  <img src="https://img.shields.io/badge/Compliance-EAS%20%2B%20ERC--8004-0EA5E9" />
  <img src="https://img.shields.io/badge/Payments-x402%20(USDC)-16A34A" />
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#protocol-architecture">Architecture</a> ·
  <a href="#live-deployment-base-sepolia">Live Addresses</a> ·
  <a href="#quick-start-using-deployed-contracts">Quick Start</a> ·
  <a href="#chainlink-cre-files">CRE Files</a>
</p>

---

## Overview

DeepSeal is a compliance-gated ERC-4626 vault for Real World Assets, where access is controlled by an automated due-diligence pipeline that orchestrates KYB verification (Sumsub via x402 micropayments), AI risk scoring (Google Gemini), on-chain attestations (EAS), and agent reputation tracking (ERC-8004) — all powered by a single Chainlink CRE workflow.

One CRE workflow execution reads an on-chain request, resolves an IPFS document bundle, verifies the company via KYB, scores risk with Gemini AI, and writes the result on-chain — triggering a cascade of 9 events across 5 contracts in a single transaction: compliance approval, EAS attestation, and ERC-8004 agent reputation + validation artifacts.

---

## Protocol Architecture

![Protocol Architecture](docs/protocol-diagram.png)


---

## Documentation Index

- Full implementation: [`docs/implementation.md`](docs/implementation.md)
- Base Sepolia deployment guide: [`docs/base-sepolia-deployment.md`](docs/base-sepolia-deployment.md)
- Anvil + Base Sepolia fork E2E guide: [`docs/anvil-base-sepolia-e2e.md`](docs/anvil-base-sepolia-e2e.md)
- Protocol architecture diagram: [`docs/protocol-diagram.png`](docs/protocol-diagram.png)
- Pitch deck slides: [`docs/Deck/`](docs/Deck/)
- Sample company bundle payload: [`docs/acme-company-bundle.upload.json`](docs/acme-company-bundle.upload.json)

---

## Core Components

| Layer | Component | What it does |
|---|---|---|
| Orchestration | **Chainlink CRE** | Runs the end-to-end due-diligence workflow and writes the final report on-chain via `EVMClient.writeReport()`. |
| Payment Rail | **x402** | Handles KYB endpoint micropayments (402 challenge → signed USDC transfer auth → retry). |
| Verification | **Sumsub (KYB)** | Returns business verification outcome and provider risk signal. |
| Risk Engine | **Google Gemini** | Produces structured `{ approved, riskScore, reasons[] }` output from extracted company context. |
| Attestation | **EAS** | Stores immutable on-chain compliance proof for each finalized decision. |
| Agent Trust | **ERC-8004** | Tracks agent identity + reputation + validation artifacts (Agents `#916`, `#917`). |
| Storage | **IPFS / Pinata** | Stores diligence bundles referenced by `metadataUri`; CRE verifies deterministic hashes. |
| Vault | **ERC-4626 RWAVault** | Enforces compliance-gated deposits using `ComplianceRegistry.isApproved()`. |
| UI | **Next.js Frontend** | Real-time SSE pipeline monitoring + request, process, vault, compliance, and agent views. |

---

## Live Deployment (Base Sepolia)

| Contract | Address |
|---|---|
| DemoUSD | [`0x523E3033F844B1E2175183846ADFD7190EDECD4a`](https://sepolia.basescan.org/address/0x523E3033F844B1E2175183846ADFD7190EDECD4a) |
| ComplianceRegistry | [`0x78383225EA842251361CE7104456322d4d151D66`](https://sepolia.basescan.org/address/0x78383225EA842251361CE7104456322d4d151D66) |
| DiligencePortal | [`0xa5A29714cb9c51A10a165cBe2025372640abb9e5`](https://sepolia.basescan.org/address/0xa5A29714cb9c51A10a165cBe2025372640abb9e5) |
| RWAComplianceReceiver | [`0x16b1D017F22F2aB47bA3eA1948ff973A024CCB4F`](https://sepolia.basescan.org/address/0x16b1D017F22F2aB47bA3eA1948ff973A024CCB4F) |
| RWAVault | [`0x65054D2De227b7e823a0c13fc0C5D6c62198963d`](https://sepolia.basescan.org/address/0x65054D2De227b7e823a0c13fc0C5D6c62198963d) |
| ValidationRegistry | [`0xa30004dfA091b5bD9B019Fa31b490847929555EC`](https://sepolia.basescan.org/address/0xa30004dfA091b5bD9B019Fa31b490847929555EC) |
| IdentityRegistry *(official ERC-8004)* | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| ReputationRegistry *(official ERC-8004)* | [`0x8004B663056A597Dffe9eCcC1965A193B7388713`](https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |
| EAS Contract *(Base native)* | [`0x4200000000000000000000000000000000000021`](https://sepolia.basescan.org/address/0x4200000000000000000000000000000000000021) |
| EAS Schema Registry | [`0x4200000000000000000000000000000000000020`](https://sepolia.basescan.org/address/0x4200000000000000000000000000000000000020) |

- ERC-8004 agents: [#916 Reputation](https://testnet.8004scan.io/agents/base-sepolia/916), [#917 Validation](https://testnet.8004scan.io/agents/base-sepolia/917), [Browse all](https://testnet.8004scan.io/agents/base-sepolia)
- EAS schema UID: `0x91f39675fa85b9340ba36983e388a4b9238c55ac7f593f2c87ba0c55115dd06a`

---

## Chainlink CRE Files

| File | Description |
|---|---|
| [`cre/chainlink-Convergence/my-workflow/main.ts`](cre/chainlink-Convergence/my-workflow/main.ts) | Main CRE workflow (trigger → on-chain read → bundle resolve/verify → KYB/x402 → Gemini → on-chain report). |
| [`cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json`](cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json) | Local Anvil fork config. |
| [`cre/chainlink-Convergence/my-workflow/config.staging.json`](cre/chainlink-Convergence/my-workflow/config.staging.json) | Base Sepolia staging config. |
| [`cre/chainlink-Convergence/project.yaml`](cre/chainlink-Convergence/project.yaml) | CRE project targets and RPC profiles. |
| [`cre/chainlink-Convergence/secrets.yaml`](cre/chainlink-Convergence/secrets.yaml) | CRE secret map template. |
| [`cre/README.md`](cre/README.md) | CRE-specific runbook and commands. |
| [`src/RWAComplianceReceiver.sol`](src/RWAComplianceReceiver.sol) | On-chain receiver for CRE reports; applies compliance/EAS/ERC-8004 effects. |
| [`services/kyb-provider/src/server.mjs`](services/kyb-provider/src/server.mjs) | KYB provider wrapper (Sumsub + x402 behavior). |
| [`app/src/app/api/workflow/run/route.ts`](app/src/app/api/workflow/run/route.ts) | SSE endpoint that runs CRE simulation and streams pipeline status. |

---

## How CRE is used in DeepSeal

CRE is the deterministic execution layer between off-chain evidence and on-chain policy:

1. Trigger starts with `requestId`.
2. Workflow reads request from `DiligencePortal`.
3. Workflow resolves + verifies document bundle.
4. Workflow executes KYB call (paid x402 path when enabled).
5. Workflow computes AI risk output (Gemini structured JSON).
6. Workflow merges outputs under policy constraints.
7. Workflow writes canonical report to `RWAComplianceReceiver`.
8. Receiver applies atomic on-chain side effects.

---

## Quick Start (Using Deployed Contracts)

### Prerequisites

- Node.js `>=18`
- Chainlink CRE CLI (`cre`) in PATH
- Foundry (optional, for CLI request submission)
- Gemini API key
- Sumsub sandbox keys (or `FORCE_APPROVE=true` for demos)

### 1) Clone + Install

```bash
git clone https://github.com/arunabha003/Chainlink-Convergence.git
cd Chainlink-Convergence

cd app && npm install && cd ..
cd services/kyb-provider && npm install && cd ../..
```

### 2) Configure env files

```bash
cp .env.example .env
cp services/kyb-provider/.env.example services/kyb-provider/.env
cp cre/chainlink-Convergence/.env.example cre/chainlink-Convergence/.env
cp cre/chainlink-Convergence/my-workflow/config.staging.example.json cre/chainlink-Convergence/my-workflow/config.staging.json
cp app/.env.local.example app/.env.local
```

Fill secrets in those copied files (`.env`, `services/kyb-provider/.env`, `cre/.../.env`, `app/.env.local`).

### 3) Optional Sumsub sanity checks

```bash
curl -s http://127.0.0.1:3001/sumsub/healthz | jq

cd services/kyb-provider
npm run check:sumsub
```

### 4) Start local services

```bash
# terminal 1
cd services/kyb-provider && npm start

# terminal 2
cd app && npm run dev
```

### 5) Run full flow from UI

1. Open `http://localhost:3000/submit` and create request.
2. Open `http://localhost:3000/process` and run CRE workflow.
3. Watch live SSE steps for KYB, AI scoring, and on-chain write.
4. Validate output in `http://localhost:3000/compliance`.
5. Test vault behavior in `http://localhost:3000/vault`.
6. Inspect agents in `http://localhost:3000/agents`.

### 6) Run CRE simulation directly (CLI)

```bash
cd cre/chainlink-Convergence
PAYLOAD='{"requestId":1}'
cre workflow simulate ./my-workflow \
  --target staging-settings \
  --trigger-index 0 \
  --http-payload "$PAYLOAD" \
  --non-interactive \
  -e .env
```

For full deployment and anvil fork flow:
- [`docs/base-sepolia-deployment.md`](docs/base-sepolia-deployment.md)
- [`docs/anvil-base-sepolia-e2e.md`](docs/anvil-base-sepolia-e2e.md)

---



## License

MIT
