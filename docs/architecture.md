# Architecture — Confidential RWA Due-Diligence Vault

## System Overview

This protocol creates a **compliance-gated DeFi vault** for Real World Assets (RWAs). Before anyone
can deposit funds, they must pass an automated due-diligence pipeline that combines traditional
KYB (Know Your Business) verification with AI risk analysis — all orchestrated by a Chainlink CRE
workflow and recorded on-chain with full transparency.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              END USER (Browser)                              │
│                           http://localhost:3000                               │
│                                                                              │
│   ┌──────────┐   ┌───────────┐   ┌────────────┐   ┌───────┐   ┌─────────┐  │
│   │Dashboard │   │  Submit   │   │  Process   │   │Comply │   │  Vault  │  │
│   │          │   │  Request  │   │  Workflow  │   │       │   │         │  │
│   └────┬─────┘   └─────┬─────┘   └─────┬──────┘   └───┬───┘   └────┬────┘  │
│        │               │               │              │            │        │
└────────┼───────────────┼───────────────┼──────────────┼────────────┼────────┘
         │               │               │              │            │
         │          DiligencePortal  API Route      Compliance    RWAVault
         │            .submit()    /api/workflow     Registry      .deposit()
         │               │          /run             .getRecord()     │
         ▼               ▼               │              ▲            ▼
┌────────────────────────────────────────┼──────────────┼────────────────────┐
│            SMART CONTRACTS             │              │                    │
│         (Anvil / Base Sepolia)         │              │                    │
│                                        │              │                    │
│  ┌────────────────┐  ┌────────────────────────────────────────┐           │
│  │DiligencePortal │  │     RWAComplianceReceiver              │           │
│  │                │  │          .onReport()                    │           │
│  │ Stores requests│  │              │                          │           │
│  │ Emits events   │  │    ┌────────┼────────┬─────────┐       │           │
│  └────────────────┘  │    ▼        ▼        ▼         ▼       │           │
│                       │ Compliance  EAS   Reputation Validation│           │
│  ┌────────────────┐  │ Registry  Attest  Registry   Registry  │           │
│  │   RWAVault     │  │ .setAppr  (opt)   .giveFB   .valReq   │           │
│  │  (ERC-4626)    │  │   oval()          .valResp             │           │
│  │                │  └────────────────────────────────────────┘           │
│  │ Checks         │       ▲                                              │
│  │ isApproved()   │───────┘                                              │
│  │ before deposit │                                                      │
│  └────────────────┘  ┌────────────────┐                                  │
│                       │    DemoUSD     │                                  │
│                       │  (ERC-20)     │                                  │
│                       │ Vault asset   │                                  │
│                       └────────────────┘                                  │
└───────────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ onReport() call
                                 │
┌────────────────────────────────┼──────────────────────────────────────────┐
│                NEXT.JS API ROUTE (SSE)                                    │
│                /api/workflow/run                                           │
│                                                                           │
│   1. Write payload (requestId + companyInfo)                              │
│   2. Sync Anvil block timestamp                                           │
│   3. Spawn `cre workflow simulate` ──────────────────────────┐            │
│   4. Stream stdout via SSE to browser                        │            │
│   5. Parse CRE result                                        │            │
│   6. Call onReport() on-chain                                │            │
│                                                              │            │
└──────────────────────────────────────────────────────────────┼────────────┘
                                                               │
┌──────────────────────────────────────────────────────────────┼────────────┐
│                   CRE WORKFLOW (main.ts)                      │            │
│                   Chainlink Compute Runtime                   │            │
│                                                               │            │
│   ┌─────────────┐    ┌──────────────┐    ┌────────────────┐  │            │
│   │ HTTP Trigger │───►│ Read Request │───►│  KYB Provider  │  │            │
│   │  (payload)   │    │  from chain  │    │  (Sumsub API)  │  │            │
│   └─────────────┘    │  EVMClient   │    │  via x402 pay  │  │            │
│                       └──────────────┘    └───────┬────────┘  │            │
│                                                   │           │            │
│                                            ┌──────▼────────┐  │            │
│                                            │  Gemini AI    │  │            │
│                                            │  Risk Scoring │  │            │
│                                            │  (structured  │  │            │
│                                            │   JSON output)│  │            │
│                                            └───────┬───────┘  │            │
│                                                    │          │            │
│                                            ┌───────▼───────┐  │            │
│                                            │ Write Report  │──┘            │
│                                            │ EVMClient     │               │
│                                            │ .writeReport()│               │
│                                            └───────────────┘               │
└────────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    KYB PROVIDER (Express.js :3001)                         │
│                                                                            │
│   POST /kyb ──────► x402 Paywall ──────► Sumsub API                      │
│        │                  │                   │                            │
│        │          402 Payment Required        │  Create/lookup applicant   │
│        │          X-PAYMENT header            │  Request check             │
│        │          EIP-712 signed              │  Get status                │
│        │                  │                   │                            │
│        ◄──────────────────┘                   │                            │
│        │                                      │                            │
│        ◄──────────────────────────────────────┘                            │
│        │  { providerStatus, providerScore, providerResponseHash }         │
│        │                                                                   │
│   POST /kyb/free ──► Same logic, no x402 (for simulation)                │
│                                                                            │
│   FORCE_APPROVE=true ──► Bypass Sumsub, return APPROVED (demo mode)       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer-by-Layer Breakdown

### Layer 1: Smart Contracts (Solidity)

| Contract | Purpose | Key Functions |
|----------|---------|---------------|
| **DiligencePortal** | Request registry — stores who wants compliance review | `submit()`, `getRequest()` |
| **ComplianceRegistry** | Compliance state store — approved/rejected per address | `setApproval()`, `isApproved()`, `getRecord()` |
| **RWAComplianceReceiver** | CRE report receiver — decodes workflow output, updates everything | `onReport()` → triggers 8 events |
| **RWAVault** | ERC-4626 yield vault — compliance-gated deposits | `deposit()`, `withdraw()`, checks `isApproved()` |
| **DemoUSD** | ERC-20 stablecoin (6 decimals) — vault's underlying asset | `mint()`, standard ERC-20 |
| **IdentityRegistry** | ERC-8004 — NFT-based agent identities | `register()`, `getAgent()` |
| **ReputationRegistry** | ERC-8004 — numerical feedback per agent | `giveFeedback()`, `getFeedback()` |
| **ValidationRegistry** | ERC-8004 — request/response validation pairs | `validationRequest()`, `validationResponse()` |

**Data flow through contracts:**

```
DiligencePortal.submit()                    User submits request
        │
        ▼ (off-chain CRE reads this)
        │
RWAComplianceReceiver.onReport()            CRE result arrives
        │
        ├──► ComplianceRegistry.setApproval()    Core compliance state
        ├──► EAS.attest() [optional]             Immutable attestation
        ├──► ReputationRegistry.giveFeedback()   Agent reputation update
        └──► ValidationRegistry.request+respond  Agent validation record
                    │
                    ▼
RWAVault.deposit()                          Now allowed (if approved)
        │
        └──► ComplianceRegistry.isApproved()    Gate check
```

### Layer 2: CRE Workflow (TypeScript, 866 lines)

The Chainlink CRE workflow is the **brain** of the protocol. It runs off-chain in a
decentralized compute environment but reads/writes on-chain data.

**Pipeline:**

```
HTTP Trigger (requestId + companyInfo)
      │
      ▼
EVMClient.read() ──► DiligencePortal.getRequest(requestId)
      │                returns: subject, docBundleHash, metadataUri
      ▼
HTTPClient.post() ──► KYB Provider (POST /kyb or /kyb/free)
      │                sends: subject, companyInfo
      │                receives: providerStatus, providerScore, providerResponseHash
      │                (x402 buyer retry on 402 response)
      ▼
HTTPClient.post() ──► Google Gemini API
      │                sends: KYB result + document data as structured prompt
      │                receives: { approved: bool, riskScore: 0-1000, reasons: string[] }
      │                (model fallback: if configured model unavailable, auto-discovers one)
      ▼
Merge Decision ──► combine KYB + Gemini results
      │              both must approve for final approved=true
      │              riskScore = weighted average
      ▼
EVMClient.writeReport() ──► RWAComplianceReceiver.onReport()
      │                       encodes: (subject, approved, riskScore, attestationHash)
      ▼
Return Result JSON ──► streamed to frontend via SSE
```

**Key CRE SDK features used:**
- `EVMClient` — on-chain read/write
- `HTTPClient` — external API calls
- `ConfidentialHTTPClient` — secret-aware HTTP (for production)
- `ConsensusAggregationByFields` — DON consensus on results
- `handler` + `Runner` — workflow lifecycle management
- `runtime.getSecret()` — CRE secrets manager
- `runtime.log()` — observable logging (parsed by frontend)

### Layer 3: KYB Provider (Express.js microservice)

```
┌─────────────────────────────────────────────┐
│              KYB Provider (:3001)            │
│                                              │
│  FORCE_APPROVE=true                          │
│  ├── Returns APPROVED immediately            │
│  └── No Sumsub API call (demo mode)         │
│                                              │
│  FORCE_APPROVE=false (real mode)             │
│  ├── Creates/looks up Sumsub applicant       │
│  ├── Triggers verification check             │
│  ├── Reads review status + answer            │
│  └── Returns providerStatus + score          │
│                                              │
│  x402 Paywall (when X402_ENABLED=true)       │
│  ├── No X-PAYMENT header → 402 + accepts[]   │
│  ├── With X-PAYMENT → verify → settle        │
│  └── On success → run KYB + return result    │
│                                              │
│  Endpoints:                                   │
│  ├── POST /kyb          (x402 protected)     │
│  ├── POST /kyb/free     (no payment)         │
│  ├── GET  /healthz      (health check)       │
│  └── GET  /sumsub/healthz (auth check)       │
└─────────────────────────────────────────────┘
```

### Layer 4: Frontend (Next.js 14)

```
┌──────────────────────────────────────────────┐
│              Frontend Pages                   │
│                                               │
│  / (Dashboard)                                │
│  ├── Diligence request count                  │
│  ├── Vault TVL + total supply                 │
│  └── ERC-8004 agent count                     │
│                                               │
│  /submit                                      │
│  ├── Subject address, metadata URI, doc hash  │
│  ├── Calls DiligencePortal.submit()           │
│  └── Links to /process after confirm          │
│                                               │
│  /process  ⭐ (the magic page)               │
│  ├── Select request ID + company info         │
│  ├── Click "Run CRE Workflow"                 │
│  ├── SSE stream from /api/workflow/run        │
│  ├── 9-step pipeline visualization            │
│  ├── Data cards: KYB, Gemini, Decision, Tx    │
│  └── Raw log feed in real-time                │
│                                               │
│  /compliance                                  │
│  ├── Address lookup → ComplianceRegistry      │
│  └── Shows: status, riskScore, attestation    │
│                                               │
│  /vault                                       │
│  ├── Mint dUSD, Approve, Deposit, Withdraw    │
│  └── Compliance-gated (needs isApproved)      │
│                                               │
│  /agents                                      │
│  ├── Browse ERC-8004 agents                   │
│  ├── Register new agents                      │
│  └── Give feedback, request validation        │
│                                               │
│  /api/workflow/run (SSE API Route)            │
│  ├── Spawns real `cre` CLI binary             │
│  ├── Parses stdout for step transitions       │
│  ├── Streams events to browser                │
│  └── Calls onReport() on-chain after CRE      │
└──────────────────────────────────────────────┘
```

### Layer 5: ERC-8004 Agent Trust Layer

ERC-8004 creates a **composable trust framework** for autonomous agents.

```
┌────────────────────────────────────────────────────────────────┐
│                    ERC-8004 Trust Layer                         │
│                                                                 │
│  ┌─────────────────────┐                                       │
│  │  IdentityRegistry   │  NFT-based agent identities           │
│  │  (ERC-721)          │  Agent #1: "Reputation Agent"         │
│  │                     │  Agent #2: "Validation Agent"         │
│  └─────────┬───────────┘                                       │
│            │                                                    │
│     ┌──────┴──────┐                                            │
│     ▼             ▼                                            │
│  ┌────────────┐ ┌──────────────┐                               │
│  │ Reputation │ │  Validation  │                               │
│  │ Registry   │ │  Registry    │                               │
│  │            │ │              │                               │
│  │ Tracks     │ │ Tracks       │                               │
│  │ feedback   │ │ request/     │                               │
│  │ scores     │ │ response     │                               │
│  │ per agent  │ │ pairs        │                               │
│  └────────────┘ └──────────────┘                               │
│                                                                 │
│  Triggered automatically by RWAComplianceReceiver.onReport():  │
│                                                                 │
│  APPROVED (riskScore=150):                                     │
│    → Reputation Agent #1 gets feedback value +850              │
│    → Validation Agent #2 gets response score 85/100            │
│                                                                 │
│  REJECTED (riskScore=950):                                     │
│    → Reputation Agent #1 gets feedback value -950              │
│    → Validation Agent #2 gets response score 0/100             │
└────────────────────────────────────────────────────────────────┘
```

---

## Security Model

```
┌─────────────────────────────────────────────────────┐
│                  Access Control                      │
│                                                      │
│  ComplianceRegistry                                  │
│  ├── owner: can set approvals + change operator      │
│  └── workflowOperator: can set approvals             │
│       (= RWAComplianceReceiver in production)        │
│                                                      │
│  RWAComplianceReceiver                               │
│  ├── forwarder: if set, only forwarder can call      │
│  │   onReport (Keystone Forwarder in production)     │
│  ├── expectedWorkflowId: validates CRE workflow ID   │
│  ├── expectedAuthor: validates workflow author        │
│  └── expectedWorkflowName: validates workflow name   │
│                                                      │
│  RWAVault                                            │
│  └── No admin keys — purely reads ComplianceRegistry │
│      Cannot be overridden without changing registry  │
│                                                      │
│  Local Demo Mode                                     │
│  ├── forwarder = address(0) → anyone can call        │
│  ├── expected* = zero → no identity checks           │
│  └── Deployer key is well-known Anvil key            │
└─────────────────────────────────────────────────────┘
```

---

## Transaction Flow (Single `onReport` Call)

One call to `RWAComplianceReceiver.onReport()` triggers this cascade:

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
├─ 6. [if EAS configured] EAS.attest(subject, ...)
│     └─ Emits: EASAttested ③ (or EASAttestFailed)
│
└─ 7. _tryRecordERC8004Artifacts()
       │
       ├─ ReputationRegistry.giveFeedback(agentId=1, value, ...)
       │  ├─ Emits: NewFeedback ④
       │  └─ Emits: ERC8004ReputationWritten ⑤
       │
       └─ ValidationRegistry.validationRequest(agentId=2, ...)
          ├─ Emits: ValidationRequest ⑥
          ├─ Emits: ERC8004ValidationRequested ⑦
          │
          └─ [if autoRespond] ValidationRegistry.validationResponse(...)
             ├─ Emits: ValidationResponse ⑧
             └─ Emits: ERC8004ValidationResponded ⑨

Total: Up to 9 events from a single transaction
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Smart Contracts** | Solidity 0.8.24, Foundry, OpenZeppelin | On-chain logic |
| **CRE Workflow** | TypeScript, @chainlink/cre-sdk | Off-chain orchestration |
| **KYB Provider** | Express.js, Sumsub API, x402 protocol | Business verification |
| **AI Risk Scoring** | Google Gemini 2.5 Flash | Structured risk analysis |
| **Frontend** | Next.js 14, wagmi v2, viem v2, Tailwind CSS | User interface |
| **Blockchain** | Base Sepolia (via Anvil fork) | EVM runtime |
| **Standards** | ERC-4626 (vault), ERC-8004 (agents), EAS (attestations) | Interoperability |
| **Payments** | x402 + EIP-712 (micropayments for KYB) | Pay-per-use compliance |
