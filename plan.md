# Confidential RWA Due‑Diligence Vault (CRE + AI + Risk/Compliance)

This `plan.md` is the single source of truth for what to implement for the hackathon submission.

## 0) One‑sentence pitch
An ERC‑4626 vault that only accepts deposits for RWA strategies once an issuer/listing passes confidential due‑diligence checks orchestrated by a Chainlink CRE workflow (external KYB/KYC + AI risk analysis), with an onchain compliance gate and an auditable attestation trail.

## 1) Success criteria (must-have)
- **CRE workflow** is the orchestration layer and is **successfully simulated via CRE CLI** *or* deployed on CRE network.
- Workflow integrates **(a) at least one blockchain write** + **(b) at least one external system** (KYB/KYC API and/or document verification API) + **(c) LLM/AI** step.
- Vault access is **actually gated** by a verifiable onchain condition (not just UI gating).
- README links to **every file that uses Chainlink/CRE**.
- 3–5 min video shows: request submitted → workflow run/simulated → onchain state updated → vault deposit allowed/blocked.

## 2) MVP scope (what we build first)
MVP is intentionally small but “real”:
- **Onchain**
  - `RWAVault` (ERC‑4626) that checks a `ComplianceRegistry` before allowing `deposit/mint`.
  - `ComplianceRegistry` controlled by a `WorkflowOperator` address (CRE signer) that can:
    - approve/deny an issuer listing (or investor address) + set caps + store a `riskScore` + store an `attestationHash` (bytes32).
  - (Optional but recommended) write an **EAS attestation** from the workflow for an immutable audit trail.
- **Offchain / CRE**
  - Workflow takes an issuer submission (HTTP trigger or event trigger), calls:
    1) KYB/KYC provider API (Confidential HTTP if available; otherwise standard HTTP + secrets)
    2) LLM endpoint to produce a structured JSON risk report
    3) EVM write: `ComplianceRegistry.setApproval(...)` (+ optional EAS attestation)
- **UI**
  - Minimal Next.js page (or simple CLI script) to submit a listing request and display status.

If time remains, add “production-like” extras (Section 8).

## 3) Design decisions (lock these early)
- **Environments**:
  - **Dev/Test**: **Foundry mainnet fork** (fast iteration + real token/contract behavior).
  - **Demo/Deploy later**: **Sepolia** (or Base Sepolia) for a clean public demo and video.
- **Gate target**:
  - Option A (simplest): gate **investors** (address allowlist) to deposit into the vault.
  - Option B: gate **issuers/listings** (RWA pool) and only enable vault once listing approved.
  - MVP recommendation: **Option A** (clearer demo: one address blocked, one allowed).
- **Who is gated** (important for ERC‑4626):
  - Gate `msg.sender` (simplest) *or* gate `receiver` (more robust if deposits can be made by routers).
  - MVP recommendation: gate **both** (`msg.sender` and `receiver`) to avoid bypasses.
- **Attestation strategy**:
  - Keep PII offchain. Onchain stores only:
    - hashes (doc bundle hash, provider response hash, risk report hash)
    - boolean approvals + numeric scores + timestamps
  - If using EAS: attest only **hashes + scores**, never raw KYB/KYC contents.

### 3.1 Mainnet fork testing approach (Foundry)
- Provide an RPC URL via env var (example): `MAINNET_RPC_URL=...`
- Tests run with: `forge test --fork-url $MAINNET_RPC_URL`
- Underlying asset choices:
  - **Fork-realistic**: use a mainnet stablecoin address and fund test accounts by either:
    - `deal(token, user, amount)` (if compatible), or
    - impersonating a funded holder and calling `transfer`.
  - **Always-works fallback**: deploy a local mock ERC‑20 even when forking, and focus fork tests on integration points (e.g., EAS contract calls) rather than the asset itself.
- Keep fork tests deterministic: pin a fork block in `foundry.toml` (`fork_block_number`) once you find a stable height.

## 4) Repo layout (target)
```
.
├─ foundry.toml
├─ src/
│  ├─ RWAVault.sol
│  ├─ ComplianceRegistry.sol
│  └─ interfaces/ (if needed)
├─ script/
│  ├─ Deploy.s.sol
│  └─ Configure.s.sol (optional)
├─ test/
│  ├─ RWAVault.t.sol
│  └─ ComplianceRegistry.t.sol
│  └─ Fork.t.sol (mainnet fork integration)
├─ cre/
│  ├─ workflow.ts
│  ├─ workflow.config.json
│  └─ README.md (how to simulate/deploy)
└─ app/ (optional UI)
   ├─ package.json
   └─ ... (Next.js)
```

## 5) Smart contracts (implementation checklist)

### 5.1 `ComplianceRegistry.sol`
Responsibilities:
- Store compliance state for a subject (investor address and/or listing id):
  - `approved` (bool)
  - `riskScore` (uint16 or uint32)
  - `cap` (uint256) and `used` (uint256) for per-subject limits (optional MVP)
  - `attestationHash` (bytes32) and `updatedAt` (uint64)
- Only `owner` or `workflowOperator` can update.
- Emit events for indexing/demo:
  - `ComplianceUpdated(subject, approved, riskScore, attestationHash, updatedAt)`

MVP functions:
- `setWorkflowOperator(address)`
- `setApproval(address subject, bool approved, uint32 riskScore, bytes32 attestationHash)`
- `isApproved(address subject) view returns (bool)`

Security:
- Use OpenZeppelin `Ownable` (or `AccessControl`) for clear roles.
- If you add caps, ensure arithmetic is safe and that vault calls update usage deterministically.

### 5.2 `RWAVault.sol` (ERC‑4626)
Responsibilities:
- Standard ERC‑4626 vault for an underlying ERC‑20 asset (mock stablecoin for demo).
- Override `deposit` and `mint` to enforce:
  - `require(complianceRegistry.isApproved(msg.sender))`
  - (optional) cap checks

Demo hooks:
- Custom error `NotCompliant(address)`
- Event `DepositBlocked(address, uint256)`

### 5.3 Optional: EAS integration
Two patterns:
- **Workflow-only**: CRE workflow calls EAS contract directly to create attestation (preferred; keeps vault simple).
- **Adapter contract**: `EASAdapter.attest(...)` called by workflow operator.

MVP recommendation: **Workflow-only**; store the resulting UID/hash in `ComplianceRegistry`.

## 6) CRE workflow (implementation checklist)

### 6.1 Inputs
Define one canonical request payload (HTTP trigger) or event payload:
```json
{
  "subject": "0xInvestorOrIssuer",
  "docBundleHash": "0x…32bytes",
  "issuerMetadataUri": "ipfs://… (optional)",
  "requestedCap": "100000000" (optional)
}
```

### 6.2 Steps (minimal but complete)
1) **Validate** input (address format, hash length, allowlisted caller).
2) **KYB/KYC API** call (Confidential HTTP if available):
   - send `docBundleHash` + metadata reference
   - receive `providerStatus`, `providerScore`, and a `providerResponseHash` (or compute hash from response)
3) **LLM risk analysis**:
   - prompt includes only non-PII + provider summary + doc hashes
   - output **strict JSON**:
     - `approved` (bool)
     - `riskScore` (0–1000)
     - `reasons[]` (strings)
     - `reportHash` (bytes32) (or compute hash client-side)
4) **Onchain write**:
   - call `ComplianceRegistry.setApproval(subject, approved, riskScore, attestationHash)`
   - where `attestationHash = keccak256(providerResponseHash || reportHash || docBundleHash)`
5) **(Optional) EAS attest**:
   - write attestation with `subject`, `riskScore`, `attestationHash`, `timestamp`
6) **Return** workflow result with tx hash + decision.

### 6.3 Secrets & config
- Store KYB/KYC API key and LLM API key in CRE secrets (never in repo).
- Keep a `cre/workflow.config.json` template with env var placeholders.

### 6.4 Simulation deliverable
- A single command/script that runs:
  - blocked case (riskScore high → `approved=false`)
  - allowed case (riskScore low → `approved=true`)
  - then demonstrate `RWAVault.deposit` reverting/passing accordingly.
Notes:
- The **CRE simulation** can be run against an anvil instance (optionally mainnet-forked) *or* Sepolia; the key is showing the workflow step outputs and a successful onchain write + vault gate behavior.

## 7) Demo script (what the video shows)
1) Deploy contracts (show addresses).
2) Attempt deposit from an unapproved address → **revert** with `NotCompliant`.
3) Run CRE workflow simulation for that address:
   - show external API call result + LLM JSON result (blur secrets)
   - show onchain tx to `ComplianceRegistry`
4) Retry deposit → **success**.
5) Show onchain event logs and (optional) EAS attestation.

## 8) “Production-oriented” upgrades (only if time permits)
- **Confidential HTTP** for KYB/KYC + doc verification pulls.
- **x402 payments**:
  - pay KYB/KYC provider per request (or pay validator agents) and include payment proof hash in `attestationHash`.
- **ERC‑8004**:
  - register diligence/validator agents; require N-of-M validations for high-value approvals.
- **Ongoing monitoring**:
  - scheduled CRE runs to re-check issuer status; auto-freeze compliance on negative updates.
- **Investor identity**:
  - support “compliance credential” model (attestation-based access) rather than simple allowlist.

## 9) Non-goals (avoid scope traps)
- Don’t store PII onchain.
- Don’t build full RWA tokenization/legal issuance.
- Don’t attempt mainnet-grade integrations with multiple providers unless already familiar—one real API + one LLM is enough for judging.

## 10) Work plan (ordered)
1) Scaffold Foundry project + add ERC‑20 mock asset.
2) Implement `ComplianceRegistry` + tests.
3) Implement `RWAVault` gating + tests.
4) Deploy scripts (local + testnet).
5) Implement CRE workflow + local simulation.
6) Add minimal UI or CLI runner to submit payload + show status.
7) Write README with:
   - workflow explanation
   - how to run simulation
   - every Chainlink/CRE file link
8) Record 3–5 min demo video.

## 11) To‑do checklist (copy/paste for execution)

### 11.1 Decisions (pick now; can change later)
- [ ] Target demo network: `Sepolia` or `Base Sepolia`.
- [ ] External KYB/KYC source for the demo:
  - Option A: real provider (requires API key).
  - Option B: minimal “KYB stub” HTTP service (still an external system, good for local simulation).
- [ ] LLM endpoint: `Gemini` / `OpenAI` / `local stub` (keys required for real).

### 11.2 Onchain (Foundry)
- [ ] `foundry init` + baseline `foundry.toml`.
- [ ] Add mock ERC‑20 asset for vault demos/tests.
- [ ] Implement `src/ComplianceRegistry.sol`.
- [ ] Implement `src/RWAVault.sol` (ERC‑4626) with compliance gating.
- [ ] Add tests:
  - [ ] `test/ComplianceRegistry.t.sol` (roles + setApproval + events)
  - [ ] `test/RWAVault.t.sol` (blocked vs allowed deposit/mint)
  - [ ] (Optional) `test/Fork.t.sol` (integration sanity on forked chain)
- [ ] Add scripts:
  - [ ] `script/Deploy.s.sol` (deploy mock asset, registry, vault; set operator)
  - [ ] (Optional) `script/Configure.s.sol` (approve a subject for demo)

### 11.3 CRE (offchain workflow)
- [ ] Create `cre/workflow.ts` with:
  - [ ] input validation
  - [ ] one external HTTP call (KYB/KYC API or stub)
  - [ ] one LLM call returning strict JSON
  - [ ] one EVM write to `ComplianceRegistry.setApproval(...)`
- [ ] Create `cre/workflow.config.json` template (no secrets committed).
- [ ] Create `cre/README.md` with:
  - [ ] how to set secrets
  - [ ] how to simulate locally against anvil
  - [ ] expected outputs (tx hash + decision JSON)

### 11.4 Minimal UX (one of these is enough)
- [ ] CLI runner (Node/TS) to POST the workflow payload and print status, OR
- [ ] `app/` Next.js page to submit and show approved/blocked state.

### 11.5 Docs + demo
- [ ] Root `README.md` with:
  - [ ] pitch + architecture diagram (simple)
  - [ ] contract addresses (if deployed)
  - [ ] how to run tests + deploy + simulate workflow
  - [ ] links to all Chainlink/CRE-related files (`cre/*`)
- [ ] 3–5 min video checklist (Section 7).
