# Demo Deck — Confidential RWA Due-Diligence Vault

> Use this as a script/outline for your 3–5 minute hackathon demo video.
> Each slide maps to ~30–45 seconds of talking time.

---

## Slide 1: Title (15 sec)

**Confidential RWA Due-Diligence Vault**

*Compliance-gated DeFi meets Chainlink CRE + AI + ERC-8004 Agents*

- Team: [Your Name]
- Hackathon: Chainlink CRE
- Stack: Solidity · Chainlink CRE · Gemini AI · Sumsub KYB · x402 · ERC-4626 · ERC-8004

---

## Slide 2: The Problem (30 sec)

**Real World Assets need compliance — DeFi doesn't have it**

- Traditional finance requires KYB/KYC before anyone can invest in RWAs
- Today, this is manual: weeks of paperwork, lawyers, back-and-forth
- DeFi vaults accept deposits from anyone — no compliance checks
- Result: **RWAs can't enter DeFi safely**, and regulators won't allow it

**The gap:** There's no automated, on-chain compliance pipeline for RWA vaults.

---

## Slide 3: Our Solution (30 sec)

**A Chainlink CRE workflow that automates the entire compliance pipeline**

```
Submit Request → KYB Check (Sumsub) → AI Risk Score (Gemini) → On-Chain Approval → Vault Access
```

- One click starts the entire pipeline
- KYB provider verifies business identity (Sumsub API)
- Gemini AI analyzes risk and produces a structured score
- Result written on-chain to a ComplianceRegistry
- ERC-4626 vault checks compliance before every deposit
- ERC-8004 agents track reputation and validate decisions

**All orchestrated by Chainlink CRE — all transparent — all on-chain.**

---

## Slide 4: Architecture (30 sec)

**Show the architecture diagram from `docs/architecture.md`**

Key points to say:
- "The CRE workflow is the brain — it reads from blockchain, calls two external APIs, and writes back"
- "KYB verification is paid via x402 micropayments — a real economic model"
- "One `onReport()` call triggers 8 on-chain events across 4 contracts"
- "The vault is purely compliance-gated — no admin can override it"

---

## Slide 5: Live Demo — Submit (30 sec)

**Show screen: http://localhost:3000/submit**

1. Connect MetaMask wallet
2. Fill subject address + metadata URI
3. Click "Submit Request" → MetaMask confirms
4. "Request #3 confirmed" banner appears
5. Click "Process with CRE Workflow →"

Say: *"The user submits a diligence request — this stores it on-chain in the DiligencePortal contract."*

---

## Slide 6: Live Demo — CRE Workflow Execution (60 sec) ⭐

**Show screen: http://localhost:3000/process**

This is the **hero moment** of the demo.

1. Fill company info (Acme LLC, USA)
2. Click **"▶ Run CRE Workflow"**
3. Watch the 9-step pipeline stream in real-time:
   - ✅ Preparing Payload
   - ✅ Syncing Block Timestamp
   - ✅ CRE Workflow Engine initialized
   - ✅ Reading On-Chain Request
   - ✅ KYB Verification (Sumsub via x402) → APPROVED, score 10
   - ✅ AI Risk Assessment (Gemini) → approved, riskScore 150
   - ✅ Final Decision → approved=true, riskScore=150
   - ✅ Broadcasting On-Chain (onReport) → tx hash, 8 events
   - ✅ On-Chain Side Effects → event list

Say: *"Watch — the CRE workflow runs the complete pipeline. Sumsub verifies the business, Gemini scores the risk, and the result is written on-chain with 8 events including ERC-8004 agent updates — all in one transaction."*

---

## Slide 7: Live Demo — Compliance Check (15 sec)

**Show screen: http://localhost:3000/compliance**

1. Paste subject address → click "Lookup"
2. Show: **APPROVED** ✅, Risk Score: 150/1000, attestation hash

Say: *"The compliance page reads directly from the on-chain registry — this is the same data the vault checks."*

---

## Slide 8: Live Demo — Vault Deposit (30 sec)

**Show screen: http://localhost:3000/vault**

1. Click "Mint 10,000 dUSD"
2. Approve vault for 1,000 dUSD
3. Deposit 1,000 dUSD → vault shares appear
4. TVL updates

Say: *"Because the user is now approved on-chain, the ERC-4626 vault accepts their deposit. Without compliance approval, this would revert."*

---

## Slide 9: ERC-8004 Agents (30 sec)

**Show screen: http://localhost:3000/agents**

1. Show Agent #1 (Reputation) — feedback score from the workflow
2. Show Agent #2 (Validation) — validated the compliance decision

Say: *"Every compliance decision automatically updates ERC-8004 agent reputation and validation records. Other protocols can query these agents to assess the trustworthiness of compliance decisions — this creates a composable trust layer."*

---

## Slide 10: What Makes This Special (30 sec)

| Feature | Why It Matters |
|---------|---------------|
| **CRE orchestration** | Decentralized, verifiable workflow — not a centralized API |
| **Real KYB provider** | Sumsub sandbox — real business verification, not a mock |
| **Gemini AI risk scoring** | Structured JSON analysis with model fallback |
| **x402 micropayments** | Pay-per-use compliance — sustainable economic model |
| **ERC-4626 vault gate** | Real DeFi primitive — not just UI gating |
| **ERC-8004 agents** | Composable trust — reputation + validation on-chain |
| **One-click from browser** | No terminal commands — judges can try it themselves |
| **8 events per report** | Deep smart contract integration, full audit trail |

---

## Slide 11: Closing (15 sec)

**Confidential RWA Due-Diligence Vault**

- Chainlink CRE automates what takes weeks in traditional finance
- Every step is verifiable, on-chain, and transparent
- From submission to vault deposit — one click

*Thank you!*

---

## Demo Script Timing

| Section | Duration | Cumulative |
|---------|----------|------------|
| Title | 15s | 0:15 |
| Problem | 30s | 0:45 |
| Solution | 30s | 1:15 |
| Architecture | 30s | 1:45 |
| Demo: Submit | 30s | 2:15 |
| Demo: CRE Workflow | 60s | 3:15 |
| Demo: Compliance | 15s | 3:30 |
| Demo: Vault | 30s | 4:00 |
| Demo: Agents | 30s | 4:30 |
| What's Special | 30s | 5:00 |
| Closing | 15s | 5:15 |

**Total: ~5 minutes** (trim Problem/Architecture if needed to hit 3 min)

---

## Tips for Recording

1. **Start with everything running** (Anvil, KYB provider, frontend) — don't waste video time on setup
2. **Pre-submit a request** so you can jump straight to the Process page
3. **Use the SSE pipeline as the visual centerpiece** — the 9 steps streaming is the "wow moment"
4. **Zoom into data cards** when KYB/Gemini results appear
5. **Have compliance page ready in another tab** — switch to it right after workflow completes
6. **Pre-mint dUSD** so the vault demo is quick
7. **Record at 1080p** minimum — judges read small text
