# Architecture — Confidential RWA Due-Diligence Vault

## System Overview

This protocol creates a **compliance-gated DeFi vault** for Real World Assets (RWAs). Before anyone
can deposit funds, they must pass an automated due-diligence pipeline that combines traditional
KYB (Know Your Business) verification with AI risk analysis — all orchestrated by a **Chainlink CRE
workflow** and recorded on-chain with full transparency via **EAS attestations** and **ERC-8004 agent
reputation/validation** artifacts.

**Chain:** Base Sepolia (84532)  
**Standards:** ERC-4626 (vault), ERC-8004 (agent trust), EAS (attestations), x402 (micropayments)

---

## Complete System Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              END USER (Browser)                                  │
│                           http://localhost:3000                                   │
│                                                                                  │
│   ┌──────────┐   ┌───────────┐   ┌────────────┐   ┌───────┐   ┌─────────────┐  │
│   │Dashboard │   │  Submit   │   │  Process   │   │Comply │   │ Vault│Agents │  │
│   │   /      │   │ /submit   │   │ /process   │   │/comply│   │/vault│/agents│  │
│   └────┬─────┘   └─────┬─────┘   └─────┬──────┘   └───┬───┘   └───┬───┬─────┘  │
│        │               │               │              │            │   │         │
└────────┼───────────────┼───────────────┼──────────────┼────────────┼───┼─────────┘
         │               │               │              │            │   │
         │          DiligencePortal  API Route      Compliance    RWAVault │
         │            .submit()    /api/workflow     Registry      .deposit()
         │               │          /run             .getRecord()     │   │
         ▼               ▼               │              ▲            ▼   │
┌────────────────────────────────────────┼──────────────┼────────────────────────────┐
│              SMART CONTRACTS (Base Sepolia 84532)     │                             │
│                                        │              │                             │
│  ┌────────────────┐  ┌────────────────────────────────────────────────┐            │
│  │DiligencePortal │  │        RWAComplianceReceiver                   │            │
│  │                │  │              .onReport()                        │            │
│  │ Stores requests│  │                  │                              │            │
│  │ Emits events   │  │    ┌─────────────┼──────────┬──────────┐       │            │
│  └────────────────┘  │    ▼             ▼          ▼          ▼       │            │
│                       │ Compliance    EAS       Reputation  Validation │            │
│  ┌────────────────┐  │ Registry    Attest      Registry    Registry   │            │
│  │   RWAVault     │  │ .setAppr   .attest()   .giveFB()  .valReq()   │            │
│  │  (ERC-4626)    │  │   oval()    ③           ④⑤         .valResp()  │            │
│  │                │  │   ①②                                ⑥⑦⑧⑨       │            │
│  │ Checks         │  └────────────────────────────────────────────────┘            │
│  │ isApproved()   │───────┘                                                        │
│  │ before deposit │                                                                │
│  └────────────────┘  ┌──────────────┐  ┌──────────────────────────────────────┐    │
│                       │   DemoUSD    │  │  ERC-8004 Official Registries        │    │
│                       │  (ERC-20)    │  │  IdentityRegistry (0x8004A8...)      │    │
│                       │  Vault asset │  │  ReputationRegistry (0x8004B6...)    │    │
│                       └──────────────┘  └──────────────────────────────────────┘    │
│                                                                                     │
│                       ┌──────────────────────────────────┐                          │
│                       │  EAS (Base Sepolia Native)        │                          │
│                       │  Contract: 0x4200...0021          │                          │
│                       │  Schema: address,bool,uint32,     │                          │
│                       │    bytes32,uint64                  │                          │
│                       │  Attestations → easscan.org       │                          │
│                       └──────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ onReport() call
                                 │
┌────────────────────────────────┼─────────────────────────────────────────┐
│                NEXT.JS API ROUTE (SSE)                                   │
│                /api/workflow/run                                          │
│                                                                          │
│   1. Receive requestId + companyInfo from frontend                       │
│   2. Write HTTP trigger payload to disk                                  │
│   3. Spawn `cre workflow simulate` CLI process                           │
│   4. Stream stdout line-by-line via SSE to browser                       │
│   5. Parse CRE result (approved, riskScore, attestationHash)             │
│   6. Call onReport() on RWAComplianceReceiver                            │
│   7. Parse tx receipt for 9 events (Compliance + EAS + ERC-8004)         │
│   8. Stream side-effect events (EASAttested UID, agent scores) to UI     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
           ┌─────────────────────┤
           │                     │
           ▼                     ▼
┌──────────────────────┐  ┌──────────────────────────────────────────────────────┐
│   IPFS / Pinata      │  │            CRE WORKFLOW (main.ts — 1082 lines)       │
│                      │  │            Chainlink Compute Runtime Environment      │
│  Document bundle     │  │                                                      │
│  stored on IPFS      │  │   ┌──────────────┐    ┌───────────────────┐          │
│  via Pinata gateway  │  │   │ HTTP Trigger  │───►│ Read On-Chain     │          │
│                      │  │   │ (requestId +  │    │ Request from      │          │
│  metadataUri points  │  │   │  companyInfo) │    │ DiligencePortal   │          │
│  to IPFS document    │  │   └──────────────┘    │ via EVMClient     │          │
│                      │  │                        └────────┬──────────┘          │
│  Hash verified on-   │  │                                 │                     │
│  chain for tamper     │  │                        ┌───────▼──────────┐          │
│  detection            │  │                        │ Resolve IPFS Doc │          │
│                      │  │                        │ from metadataUri │          │
└──────────────────────┘  │                        │ Extract company  │          │
                          │                        │ info + hashes    │          │
                          │                        └────────┬─────────┘          │
                          │                                 │                     │
                          │                        ┌────────▼─────────┐          │
                          │                        │  KYB Provider    │          │
                          │                        │  (Sumsub API)    │          │
                          │                        │  via x402 pay    │          │
                          │                        └────────┬─────────┘          │
                          │                                 │                     │
                          │                        ┌────────▼─────────┐          │
                          │                        │  Gemini AI       │          │
                          │                        │  Risk Scoring    │          │
                          │                        │  (structured     │          │
                          │                        │   JSON output)   │          │
                          │                        └────────┬─────────┘          │
                          │                                 │                     │
                          │                        ┌────────▼─────────┐          │
                          │                        │  Merge Decision  │          │
                          │                        │  KYB ∧ AI both   │          │
                          │                        │  must approve    │          │
                          │                        └────────┬─────────┘          │
                          │                                 │                     │
                          │                        ┌────────▼─────────┐          │
                          │                        │  Write Report    │──────────┘
                          │                        │  EVMClient       │
                          │                        │  .writeReport()  │
                          │                        └──────────────────┘
                          │
                          └──────────────────────────────────────────────────────┐
                                                                                 │
┌────────────────────────────────────────────────────────────────────────────────┼┐
│                    KYB PROVIDER (Express.js :3001)                              ││
│                                                                                ││
│   POST /kyb ──────► x402 Paywall ──────► Sumsub API                           ││
│        │                  │                   │                                 ││
│        │          402 Payment Required        │  Create/lookup applicant        ││
│        │          X-PAYMENT header            │  Request verification check     ││
│        │          EIP-3009 (USDC)             │  Get status + answer            ││
│        │                  │                   │                                 ││
│        ◄──────────────────┘                   │                                 ││
│        │                                      │                                 ││
│        ◄──────────────────────────────────────┘                                 ││
│        │  { providerStatus, providerScore, providerResponseHash }              ││
│                                                                                ││
│   POST /kyb/free ──► Same logic, no x402 (for CRE simulation)                 ││
│   FORCE_APPROVE=true ──► Bypass Sumsub, return APPROVED (demo mode)            ││
│                                                                                ││
│   x402 Payment Flow:                                                           ││
│   ├── CRE buyer wallet signs EIP-3009 transferWithAuthorization                ││
│   ├── 0.01 USDC per KYB call (Base Sepolia USDC)                              ││
│   └── Provider verifies + settles payment before running KYB                   ││
│                                                                                ││
└────────────────────────────────────────────────────────────────────────────────┘│
                                                                                  │
                          ┌───────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                    GOOGLE GEMINI AI                                               │
│                                                                                  │
│   Model: gemini-2.5-flash (with auto-fallback)                                   │
│                                                                                  │
│   Input: KYB result + document data + company info                               │
│   Output: { approved: bool, riskScore: 0-1000, reasons: string[] }               │
│                                                                                  │
│   Structured prompt includes:                                                    │
│   ├── Company name, country, registration number                                 │
│   ├── KYB provider status and score                                              │
│   ├── Document hashes for provenance                                             │
│   └── Risk factors to evaluate                                                   │
│                                                                                  │
│   AI decides independently — CRE combines with KYB for final decision:           │
│   ├── Both KYB and Gemini must approve → approved = true                         │
│   └── riskScore = weighted average of both scores                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Deep-Dive

### 1. DiligencePortal

**Contract:** `src/DiligencePortal.sol`  
**Purpose:** Request registry — stores who wants compliance review  

Users submit a diligence request specifying:
- **subject** — the address requesting compliance clearance
- **docBundleHash** — keccak256 hash of the document bundle (tamper-proof)
- **metadataUri** — IPFS/Pinata URI pointing to the document bundle

The portal assigns an auto-incrementing `requestId`, stores the request on-chain, and emits a
`DiligenceRequested` event. The CRE workflow reads this request to begin processing.

| Function | Description |
|----------|-------------|
| `submit(subject, docBundleHash, metadataUri)` | Create a new diligence request |
| `getRequest(requestId)` | Read a stored request (used by CRE) |
| `requestCount()` | Total number of requests submitted |

---

### 2. ComplianceRegistry

**Contract:** `src/ComplianceRegistry.sol`  
**Purpose:** Per-address compliance state store

Maintains the approval status for each address:
- `approved` (bool) — can this address deposit into the vault?
- `riskScore` (uint32) — numerical risk assessment (0–1000)
- `attestationHash` (bytes32) — hash of the compliance evidence
- `updatedAt` (uint64) — timestamp of last update

Only the **owner** or **workflowOperator** (= RWAComplianceReceiver) can write to this registry.
The RWAVault reads from it to gate deposits.

| Function | Description |
|----------|-------------|
| `setApproval(subject, approved, riskScore, attestationHash)` | Write compliance decision |
| `isApproved(subject)` | Check if an address is approved |
| `getRecord(subject)` | Full compliance record (status + risk + attestation) |
| `setWorkflowOperator(operator)` | Grant write access to CRE receiver (owner only) |

---

### 3. RWAComplianceReceiver

**Contract:** `src/RWAComplianceReceiver.sol`  
**Purpose:** CRE report receiver — decodes workflow output, triggers all side effects

This is the **central hub** of the protocol. When `onReport()` is called (by the CRE Keystone
Forwarder in production, or directly in simulation mode), it:

1. **Validates** the caller (forwarder check) and workflow identity (ID, author, name)
2. **Decodes** the report: `(address subject, bool approved, uint32 riskScore, bytes32 attestationHash)`
3. **Writes compliance** → `ComplianceRegistry.setApproval()`
4. **Creates EAS attestation** → `EAS.attest()` on Base Sepolia (0x4200...0021)
5. **Records reputation** → `ReputationRegistry.giveFeedback()` for both agents (#916, #917)
6. **Issues validation** → `ValidationRegistry.validationRequest()` + auto-respond

**Scoring logic (`_toReputationValue`):**
- Approved with riskScore=50 → reputation value = `(1000 - 50) / 10` = **95**
- Approved with riskScore=500 → reputation value = `(1000 - 500) / 10` = **50**
- Rejected with riskScore=950 → reputation value = `(950 - 500) / 10` = **45**
- Values are in 0–100 range (decimals=0) for 8004scan compatibility

**A single `onReport()` call emits up to 9 events:**

| # | Event | Source |
|---|-------|--------|
| ① | `ComplianceUpdated` | ComplianceRegistry |
| ② | `ReportProcessed` | RWAComplianceReceiver |
| ③ | `EASAttested` (uid) | RWAComplianceReceiver (from EAS) |
| ④ | `NewFeedback` | ReputationRegistry (agent #916) |
| ⑤ | `ERC8004ReputationWritten` | RWAComplianceReceiver |
| ⑥ | `NewFeedback` | ReputationRegistry (agent #917) |
| ⑦ | `ERC8004ReputationWritten` | RWAComplianceReceiver |
| ⑧ | `ValidationRequest` + `ERC8004ValidationRequested` | ValidationRegistry + Receiver |
| ⑨ | `ValidationResponse` + `ERC8004ValidationResponded` | ValidationRegistry + Receiver |

**EAS Configuration:**
- Contract: `0x4200000000000000000000000000000000000021` (Base Sepolia native)
- Schema: `address subject, bool approved, uint32 riskScore, bytes32 attestationHash, uint64 timestamp`
- Schema UID: `0x91f39675fa85b9340ba36983e388a4b9238c55ac7f593f2c87ba0c55115dd06a`
- Revocable: true
- Viewable on [base-sepolia.easscan.org](https://base-sepolia.easscan.org)

---

### 4. RWAVault

**Contract:** `src/RWAVault.sol`  
**Purpose:** ERC-4626 compliant yield vault with compliance gate

A standard ERC-4626 vault where the underlying asset is DemoUSD. The vault enforces that
**both** `msg.sender` AND the `receiver` address must be approved in the ComplianceRegistry before
any deposit or mint operation is allowed.

- No admin keys — purely reads ComplianceRegistry
- Cannot be overridden without changing the registry
- Withdrawals are not gated (approved users can always exit)

---

### 5. DemoUSD

**Contract:** `src/DemoUSD.sol`  
**Purpose:** ERC-20 stablecoin (6 decimals) with public `mint()` for testing

A simple mintable ERC-20 token used as the vault's underlying asset. Anyone can `mint()` tokens
for testing purposes on testnet.

---

### 6. CRE Workflow (main.ts)

**File:** `cre/chainlink-Convergence/my-workflow/main.ts` (1082 lines)  
**Purpose:** Off-chain orchestration brain — the full due-diligence pipeline

The Chainlink CRE (Compute Runtime Environment) workflow is a TypeScript program that runs in
Chainlink's decentralized compute nodes. It performs the entire compliance assessment pipeline:

**Pipeline Steps:**

```
Step 1: HTTP Trigger
  └─ Receives: { requestId, companyInfo? }

Step 2: Read On-Chain Request
  └─ EVMClient.read() → DiligencePortal.getRequest(requestId)
  └─ Returns: subject, docBundleHash, metadataUri

Step 3: Resolve Document Bundle
  └─ Fetches IPFS document from metadataUri (e.g., Pinata gateway)
  └─ Extracts company info (name, country, registration number)
  └─ Computes sourceHash and extractionHash for provenance

Step 4: KYB Verification
  └─ HTTPClient.post() → KYB Provider (POST /kyb/free or /kyb)
  └─ x402 buyer retry: if 402 → sign EIP-3009 → retry with X-PAYMENT header
  └─ Returns: providerStatus (APPROVED/REJECTED), providerScore, providerResponseHash

Step 5: Gemini AI Risk Scoring
  └─ HTTPClient.post() → Google Gemini API
  └─ Structured prompt with KYB result + document data + company context
  └─ Model auto-fallback if configured model unavailable
  └─ Returns: { approved: bool, riskScore: 0-1000, reasons: string[] }

Step 6: Merge Decision
  └─ Final approved = KYB approved AND Gemini approved
  └─ Final riskScore = weighted average
  └─ attestationHash = keccak256(subject, approved, riskScore, docBundleHash)

Step 7: Write Report
  └─ EVMClient.writeReport() → RWAComplianceReceiver.onReport()
  └─ ABI-encoded: (subject, approved, riskScore, attestationHash)
```

**CRE SDK Features Used:**

| Feature | Purpose |
|---------|---------|
| `EVMClient` | On-chain read (portal) and write (receiver) |
| `HTTPClient` | External API calls (KYB, Gemini) |
| `ConfidentialHTTPClient` | Secret-aware HTTP for production x402 |
| `ConsensusAggregationByFields` | DON consensus (identical/median) |
| `handler` + `Runner` | Workflow lifecycle management |
| `runtime.getSecret()` | CRE secrets manager |
| `runtime.log()` | Observable logging (parsed by frontend) |

---

### 7. KYB Provider

**Service:** `services/kyb-provider/src/server.mjs`  
**Purpose:** KYB verification microservice with x402 payment rail

An Express.js server that wraps the Sumsub KYB API behind an x402 micropayment paywall:

| Endpoint | Description |
|----------|-------------|
| `POST /kyb` | x402-paywalled KYB verification |
| `POST /kyb/free` | Free KYB (for CRE simulation) |
| `GET /healthz` | Server health check |
| `GET /sumsub/healthz` | Sumsub auth validation |

**x402 Payment Flow:**
1. CRE workflow sends POST /kyb without payment header
2. Provider responds 402 with `accepts` field (USDC address, price=0.01)
3. CRE buyer wallet signs EIP-3009 `transferWithAuthorization`
4. CRE retries with `X-PAYMENT` header containing the signed payment
5. Provider verifies + settles payment, then runs KYB
6. Returns: `{ providerStatus, providerScore, providerResponseHash }`

**Modes:**
- `FORCE_APPROVE=true` — Bypass Sumsub, return APPROVED (demo/hackathon mode)
- `X402_ENABLED=true` — Require x402 payment on `/kyb` endpoint
- Real mode — Creates Sumsub applicant, triggers check, reads result

---

### 8. ERC-8004 Agent Trust Layer

**Contracts:** `src/erc8004/IdentityRegistry.sol`, `ReputationRegistry.sol`, `ValidationRegistry.sol`  
**Official Registries:** Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`  
**Agent IDs:** #916 (Reputation Agent), #917 (Validation Agent)

ERC-8004 creates a **composable trust framework** for autonomous agents. Each agent has an on-chain
NFT identity, and their behavior is tracked via reputation feedback and validation records.

**Automated by RWAComplianceReceiver.onReport():**

| Action | Agent | Details |
|--------|-------|---------|
| Reputation feedback | Agent #916 | Score in 0–100 range, tag="diligence" |
| Reputation feedback | Agent #917 | Score in 0–100 range, tag="validation" |
| Validation request | Agent #917 | Request hash linking to compliance evidence |
| Validation auto-response | Agent #917 | Score=0–100 based on risk assessment |

**Score Examples (riskScore from Gemini):**
- `riskScore=50` (low risk, approved) → reputation = **95**, validation response = **95**
- `riskScore=500` (medium risk, approved) → reputation = **50**, validation response = **50**
- Rejected → reputation = negative, validation response = **0**

Visible on [8004scan.vercel.app](https://8004scan.vercel.app) for agents #916 and #917.

---

### 9. EAS (Ethereum Attestation Service)

**Contract:** `0x4200000000000000000000000000000000000021` (Base Sepolia native)  
**Schema Registry:** `0x4200000000000000000000000000000000000020`

Every compliance decision creates an immutable EAS attestation with:

```
Schema: address subject, bool approved, uint32 riskScore, bytes32 attestationHash, uint64 timestamp
Schema UID: 0x91f39675fa85b9340ba36983e388a4b9238c55ac7f593f2c87ba0c55115dd06a
```

Attestations are:
- Created automatically in `onReport()` via `EAS.attest()`
- Linked to the compliance subject address
- Revocable (in case of compliance status changes)
- Viewable on [base-sepolia.easscan.org](https://base-sepolia.easscan.org)

---

### 10. Frontend (Next.js 14)

**Directory:** `app/`  
**Purpose:** Full-featured UI for the entire protocol

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | Request count, vault TVL, agent count, contract addresses |
| **Submit** | `/submit` | Submit diligence request to DiligencePortal |
| **Process** | `/process` | Run CRE workflow with real-time 10-step pipeline visualization |
| **Compliance** | `/compliance` | Lookup compliance status by address |
| **Vault** | `/vault` | Mint/approve/deposit/withdraw DemoUSD + vault shares |
| **Agents** | `/agents` | Browse ERC-8004 agents, reputation scores, EAS config |

**Process Page Features:**
- Real-time SSE streaming of CRE workflow execution
- Gemini Input Context card (company name, country, registration, KYB status, doc hash)
- ERC-8004 Agent Score cards with progress bars and 8004scan links
- EAS Attestation card with UID link to easscan.org
- Document provenance hashes (source + extraction)
- Raw log feed

---

### 11. IPFS Document Storage (Pinata)

Documents are stored on IPFS via Pinata and referenced by their CID in the `metadataUri` field.
The workflow resolves these documents, extracts structured company information, and computes
provenance hashes:

- **sourceHash** — keccak256 of the raw IPFS document content
- **extractionHash** — keccak256 of the extracted company fields

These hashes are tracked throughout the pipeline and displayed in the frontend for full
document provenance transparency.

---

## Data Flow (End-to-End)

```
1. USER submits request on /submit page
   └─► DiligencePortal.submit(subject, docBundleHash, metadataUri)
   └─► Emits DiligenceRequested(requestId=N)

2. USER clicks "Run CRE Workflow" on /process page
   └─► POST /api/workflow/run { requestId: N, companyInfo }

3. API ROUTE spawns `cre workflow simulate`
   └─► CRE reads DiligencePortal.getRequest(N) on-chain
   └─► CRE resolves IPFS document bundle from metadataUri
   └─► CRE calls KYB Provider (Sumsub via x402)
   └─► CRE calls Gemini AI for risk scoring
   └─► CRE combines results → (approved, riskScore, attestationHash)

4. API ROUTE calls RWAComplianceReceiver.onReport()
   └─► ComplianceRegistry.setApproval()     — compliance state ✓
   └─► EAS.attest()                          — immutable attestation ✓
   └─► ReputationRegistry.giveFeedback(#916) — agent reputation ✓
   └─► ReputationRegistry.giveFeedback(#917) — agent reputation ✓
   └─► ValidationRegistry.request+respond    — validation record ✓
   └─► Up to 9 events emitted in single transaction

5. USER can now deposit into RWAVault
   └─► RWAVault.deposit() checks ComplianceRegistry.isApproved() → ✓
```

---

## Security Model

| Component | Access Control |
|-----------|---------------|
| **ComplianceRegistry** | `owner` + `workflowOperator` (= receiver) can write |
| **RWAComplianceReceiver** | `forwarder` check (Keystone Forwarder in production, disabled in simulation) |
| **RWAComplianceReceiver** | Workflow identity check (workflowId, author, name) |
| **RWAVault** | No admin — purely reads ComplianceRegistry, immutable gate |
| **DiligencePortal** | Permissionless submit — anyone can request compliance review |
| **ERC-8004 Registries** | Official contracts — standard access control per ERC-8004 |

**Local/Demo Mode:**
- `forwarder = address(0)` → anyone can call `onReport`
- `expected* = zero` → no identity checks
- `FORCE_APPROVE=true` → KYB always returns APPROVED

---

## Transaction Flow (Single `onReport` Call)

```
onReport(metadata, report)
│
├─ 1. Validate forwarder (if set)
├─ 2. Decode + validate workflow identity from metadata
├─ 3. Decode report: (subject, approved, riskScore, attestationHash)
│
├─ 4. ComplianceRegistry.setApproval(subject, approved, riskScore, attestationHash)
│     └─ Emits: ComplianceUpdated ①
│
├─ 5. Emit: ReportProcessed ②
│
├─ 6. [EAS configured] EAS.attest(subject, ...)
│     └─ Emits: EASAttested ③
│
└─ 7. _tryRecordERC8004Artifacts()
       │
       ├─ ReputationRegistry.giveFeedback(agentId=916, value, tag="diligence")
       │  ├─ Emits: NewFeedback ④
       │  └─ Emits: ERC8004ReputationWritten ⑤
       │
       ├─ ReputationRegistry.giveFeedback(agentId=917, value, tag="validation")
       │  ├─ Emits: NewFeedback ⑥
       │  └─ Emits: ERC8004ReputationWritten ⑦
       │
       └─ ValidationRegistry.validationRequest(agentId=917, ...)
          ├─ Emits: ERC8004ValidationRequested ⑧
          │
          └─ [autoRespond] ValidationRegistry.validationResponse(...)
             └─ Emits: ERC8004ValidationResponded ⑨

Total: Up to 9 events from a single transaction
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Smart Contracts** | Solidity 0.8.24, Foundry, OpenZeppelin | On-chain logic |
| **CRE Workflow** | TypeScript, @chainlink/cre-sdk v1.0.11 | Off-chain orchestration |
| **KYB Provider** | Express.js, Sumsub API, x402 protocol | Business verification |
| **AI Risk Scoring** | Google Gemini 2.5 Flash | Structured risk analysis |
| **Frontend** | Next.js 14, wagmi v2, viem v2, Tailwind CSS | User interface |
| **Blockchain** | Base Sepolia (84532) | EVM runtime |
| **Attestations** | EAS (Ethereum Attestation Service) | Immutable compliance proofs |
| **Agent Trust** | ERC-8004 (Identity, Reputation, Validation) | Composable agent framework |
| **Payments** | x402 + EIP-3009 (USDC micropayments) | Pay-per-use KYB |
| **Storage** | IPFS via Pinata | Document bundle storage |
