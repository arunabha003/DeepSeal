# Confidential RWA Due-Diligence Vault



A compliance-gated **ERC-4626 vault** for Real World Assets, where access is controlled by an automated due-diligence pipeline that orchestrates **KYB verification** (Sumsub via x402 micropayments), **AI risk scoring** (Google Gemini), **on-chain attestations** (EAS), and **agent reputation tracking** (ERC-8004) — all powered by a single **Chainlink CRE workflow**.

One CRE workflow execution reads an on-chain request, resolves an IPFS document bundle, verifies the company via KYB, scores risk with Gemini AI, and writes the result on-chain — triggering a cascade of **9 events** across 5 contracts in a single transaction: compliance approval, EAS attestation, and ERC-8004 agent reputation + validation artifacts.

Implementation details: [`docs/implementation.md`](docs/implementation.md)  
Visual diagram: [`docs/protocol-diagram.html`](docs/protocol-diagram.html)

---

## Key Components

| Feature | What It Does |
|---------|-------------|
| **Chainlink CRE** | Off-chain orchestration engine — a single TypeScript workflow reads on-chain requests, calls external APIs, scores risk, and writes the compliance result back on-chain via `EVMClient.writeReport()` |
| **x402 Micropayments** | KYB verification is paywalled with the x402 HTTP payment protocol — CRE workflow pays 0.01 USDC per call using EIP-3009 `transferWithAuthorization` (402 → sign → retry) |
| **EAS Attestations** | Every compliance decision is attested on-chain via the Ethereum Attestation Service (Base Sepolia native) — immutable, verifiable proof of due-diligence |
| **ERC-8004 Agent Trust** | Two NFT-based agent identities (Agents #916 & #917) with reputation feedback scores (0-100) and validation request/response records on official ERC-8004 registries |
| **Google Gemini AI** | Structured risk scoring — company context + KYB data fed to Gemini 2.5 Flash → `{ approved, riskScore: 0-1000, reasons[] }` with automatic model fallback |
| **IPFS / Pinata** | Company document bundles stored on IPFS, referenced by `metadataUri` in on-chain requests — CRE workflow resolves and verifies with deterministic `sourceHash` + `extractionHash` |
| **ERC-4626 Compliance Vault** | Yield vault where deposits require `ComplianceRegistry.isApproved()` — no admin keys, fully on-chain access control driven by CRE workflow output |
| **Real-Time Frontend** | Next.js 14 app with SSE streaming of CRE workflow execution — 6 pages covering submit, process, compliance lookup, vault operations, and ERC-8004 agent browsing |

---

## Live Deployed Addresses (Base Sepolia)

| Contract | Address |
|----------|---------|
| **DemoUSD** | [`0x523E3033F844B1E2175183846ADFD7190EDECD4a`](https://sepolia.basescan.org/address/0x523E3033F844B1E2175183846ADFD7190EDECD4a) |
| **ComplianceRegistry** | [`0x78383225EA842251361CE7104456322d4d151D66`](https://sepolia.basescan.org/address/0x78383225EA842251361CE7104456322d4d151D66) |
| **DiligencePortal** | [`0xa5A29714cb9c51A10a165cBe2025372640abb9e5`](https://sepolia.basescan.org/address/0xa5A29714cb9c51A10a165cBe2025372640abb9e5) |
| **RWAComplianceReceiver** | [`0x16b1D017F22F2aB47bA3eA1948ff973A024CCB4F`](https://sepolia.basescan.org/address/0x16b1D017F22F2aB47bA3eA1948ff973A024CCB4F) |
| **RWAVault** | [`0x65054D2De227b7e823a0c13fc0C5D6c62198963d`](https://sepolia.basescan.org/address/0x65054D2De227b7e823a0c13fc0C5D6c62198963d) |
| **ValidationRegistry** | [`0xa30004dfA091b5bD9B019Fa31b490847929555EC`](https://sepolia.basescan.org/address/0xa30004dfA091b5bD9B019Fa31b490847929555EC) |
| **IdentityRegistry** *(official ERC-8004)* | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| **ReputationRegistry** *(official ERC-8004)* | [`0x8004B663056A597Dffe9eCcC1965A193B7388713`](https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |
| **EAS Contract** *(Base Sepolia native)* | [`0x4200000000000000000000000000000000000021`](https://sepolia.basescan.org/address/0x4200000000000000000000000000000000000021) |
| **EAS Schema Registry** | [`0x4200000000000000000000000000000000000020`](https://sepolia.basescan.org/address/0x4200000000000000000000000000000000000020) |

**ERC-8004 Agents:** #916 (Reputation), #917 (Validation) — [View on 8004scan](https://8004scan.vercel.app)  
**EAS Schema UID:** `0x91f39675fa85b9340ba36983e388a4b9238c55ac7f593f2c87ba0c55115dd06a`

---

## How to Run (Using Deployed Contracts)

The contracts are already deployed on **Base Sepolia** at the addresses above. Follow these steps to run the full pipeline locally.

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Chainlink CRE CLI](https://docs.chain.link/cre) (`cre` binary in PATH)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (only needed if you want to submit requests via CLI)
- Gemini API key (free from [aistudio.google.com](https://aistudio.google.com))
- Sumsub sandbox keys (or use `FORCE_APPROVE=true` for demos)

### 1. Clone & Install

```bash
git clone https://github.com/arunabha003/Chainlink-Convergence.git
cd Chainlink-Convergence

# Install frontend
cd app && npm install && cd ..

# Install KYB provider
cd services/kyb-provider && npm install && cd ../..
```

### 2. Configure Secrets

Copy the `.example` files and fill in your secrets:

```bash
# Root environment (for Foundry scripts / tools)
cp .env.example .env

# KYB provider
cp services/kyb-provider/.env.example services/kyb-provider/.env

# CRE workflow
cp cre/chainlink-Convergence/.env.example cre/chainlink-Convergence/.env

# CRE workflow config (staging — already has testnet addresses)
cp cre/chainlink-Convergence/my-workflow/config.staging.example.json \
   cre/chainlink-Convergence/my-workflow/config.staging.json

# Frontend
cp app/.env.local.example app/.env.local
```

Edit each file and fill in your API keys and private keys. The `.example` files contain testnet addresses pre-filled — you only need to add secrets.

> Never commit `.env` files. They are all gitignored.

### 2.1 Sumsub keys and quick verification

Set these in `services/kyb-provider/.env`:
- `SUMSUB_APP_TOKEN`
- `SUMSUB_SECRET_KEY`
- `SUMSUB_LEVEL_NAME` (business verification level)

Then validate auth:

```bash
# with server running
curl -s http://127.0.0.1:3001/sumsub/healthz | jq

# without starting the server
cd services/kyb-provider
npm run check:sumsub
```

Expected: `authValid: true`. If `false` with `401/403`, token/secret/signature inputs are incorrect.

### 3. Start Services

```bash
# Terminal 1: KYB Provider (with x402 paywall)
cd services/kyb-provider && npm start
# → http://localhost:3001

# Terminal 2: Frontend
cd app && npm run dev
# → http://localhost:3000
```

### 4. Use the Pipeline

1. Go to **http://localhost:3000/submit** — submit a diligence request (subject address + IPFS doc bundle)
2. Go to **http://localhost:3000/process** — select the request and click "Run CRE Workflow"
3. Watch the 10-step pipeline execute in real-time via SSE streaming
4. Check **http://localhost:3000/compliance** — verify the address is approved
5. Go to **http://localhost:3000/vault** — deposit into the compliance-gated vault
6. Check **http://localhost:3000/agents** — view ERC-8004 agent reputation scores

### Alternative: Run CRE Simulation via CLI

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

> For full deployment from scratch or Anvil fork testing, see [docs/base-sepolia-deployment.md](docs/base-sepolia-deployment.md) and [docs/anvil-base-sepolia-e2e.md](docs/anvil-base-sepolia-e2e.md).

---

## Chainlink CRE Files

| File | Description |
|------|-------------|
| [`cre/chainlink-Convergence/my-workflow/main.ts`](cre/chainlink-Convergence/my-workflow/main.ts) | **CRE Workflow** — 1081-line TypeScript workflow: HTTP trigger → read on-chain request → resolve IPFS doc → deterministic extraction → KYB (x402) → Gemini AI risk scoring → write compliance report on-chain |
| [`cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json`](cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json) | CRE config for local Anvil fork simulation |
| [`cre/chainlink-Convergence/my-workflow/config.staging.json`](cre/chainlink-Convergence/my-workflow/config.staging.json) | CRE config for Base Sepolia staging |
| [`cre/chainlink-Convergence/project.yaml`](cre/chainlink-Convergence/project.yaml) | CRE project settings — RPC targets for anvil / staging / production |
| [`cre/chainlink-Convergence/secrets.yaml`](cre/chainlink-Convergence/secrets.yaml) | CRE secrets configuration |
| [`cre/README.md`](cre/README.md) | CRE workflow setup and simulation instructions |
| [`src/RWAComplianceReceiver.sol`](src/RWAComplianceReceiver.sol) | On-chain CRE report receiver — validates workflow identity, updates compliance, triggers EAS + ERC-8004 |
| [`src/ComplianceRegistry.sol`](src/ComplianceRegistry.sol) | Compliance state store — written by CRE workflow via receiver, read by vault |
| [`src/RWAVault.sol`](src/RWAVault.sol) | ERC-4626 vault with compliance gate — deposits require `isApproved()` |
| [`services/kyb-provider/src/server.mjs`](services/kyb-provider/src/server.mjs) | KYB microservice (Sumsub + x402 paywall) — called by CRE workflow via HTTPClient |
| [`app/src/app/api/workflow/run/route.ts`](app/src/app/api/workflow/run/route.ts) | Next.js SSE API route — spawns CRE CLI, streams steps to browser, writes on-chain |

---

## How CRE Is Used

### The Problem

Compliance verification for RWAs requires multiple off-chain data sources (KYB providers, AI risk models, document verification) combined with on-chain state management. This needs to be:
- **Deterministic** — same inputs → same compliance decision
- **Verifiable** — results can be attested and audited
- **Trustless** — no single party controls the outcome

### CRE as the Orchestration Layer

The **Chainlink CRE workflow** (`main.ts`, 1081 lines) is the brain of the protocol. It runs as a TypeScript program in Chainlink's decentralized compute nodes, orchestrating the entire pipeline:

```
HTTP Trigger (requestId)
    │
    ▼
EVMClient.read() ──► DiligencePortal.getRequest(requestId)
    │                  (on-chain request: subject, docBundleHash, metadataUri)
    ▼
HTTPClient ──► Resolve IPFS Document (Pinata)
    │           Extract company info + compute provenance hashes
    ▼
HTTPClient ──► KYB Provider (POST /kyb/free)
    │           Sumsub verification with x402 micropayment rail
    │           Returns: providerStatus, providerScore
    ▼
HTTPClient ──► Google Gemini AI (structured JSON)
    │           Risk scoring with company context + KYB data
    │           Returns: { approved, riskScore: 0-1000, reasons[] }
    ▼
Merge Decision ──► KYB ∧ AI both must approve
    │               riskScore = weighted average
    ▼
EVMClient.writeReport() ──► RWAComplianceReceiver.onReport()
                             9 events: compliance + EAS + ERC-8004
```

### CRE SDK Features Used

| SDK Feature | How We Use It |
|-------------|---------------|
| **`EVMClient`** | Read diligence requests from DiligencePortal, write compliance reports to RWAComplianceReceiver |
| **`HTTPClient`** | Call KYB Provider (Sumsub), Google Gemini API, IPFS resolver |
| **`ConfidentialHTTPClient`** | Secret-aware HTTP for x402 payments in production (signed USDC transfers) |
| **`ConsensusAggregationByFields`** | DON consensus — `identical` for approval, `median` for riskScore |
| **`handler` + `Runner`** | Workflow lifecycle — trigger parsing, step execution, result encoding |
| **`runtime.getSecret()`** | CRE secrets manager for API keys (Gemini, Sumsub) |
| **`runtime.log()`** | Observable logging — each step logs progress, parsed by frontend SSE for real-time visualization |
| **`encodeCallMsg` + `encodeAbiParameters`** | ABI encoding for on-chain reads/writes |
| **`getNetwork()`** | Chain selector resolution for EVMClient targets |

---



## 📄 License

MIT
