# Frontend Flow Guide — Step by Step

> **Key concept:** The frontend handles the **entire flow** end-to-end. You submit a
> diligence request on `/submit`, then click **"Process with CRE Workflow"** to run the
> off-chain CRE workflow (Sumsub KYB + Gemini AI) and write the result on-chain —
> **all from the browser**, with real-time step-by-step visibility via SSE streaming.

---

## What Must Be Running (3 terminals)

| Terminal | Command | Purpose |
|----------|---------|---------|
| **T1** | `anvil --fork-url https://sepolia.base.org --chain-id 84532 --host 127.0.0.1 --port 8545` | Local blockchain |
| **T2** | `cd services/kyb-provider && npm run dev` | KYB provider (Sumsub + x402 paywall) on port 3001 |
| **T3** | `cd app && npm run dev` | Next.js frontend on port 3000 |

> If Anvil was just (re)started, run the **After Anvil Restart** one-liner from
> [anvil-base-sepolia-e2e.md](anvil-base-sepolia-e2e.md) first.

---

## MetaMask Setup (one time)

1. Open MetaMask → Settings → Networks → **Add network manually**
   - Network name: `Base Sepolia (Local Fork)`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `84532`
   - Currency symbol: `ETH`
2. Import Account #0 (deployer/owner/subject):
   - Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - This account has: 10000 ETH, 1,000,000 dUSD, owner of all contracts

---

## Full Flow: Submit → Process → Compliance → Vault

### Step 1: Open Dashboard (`http://localhost:3000`)

- Click **Connect Wallet** (top-right) → MetaMask connects.
- You should see:
  - **Diligence Requests**: current count
  - **Vault TVL**: 0
  - **ERC-8004 Agents**: 2

### Step 2: Submit a Diligence Request (`/submit`)

1. Click **Submit Request** in the nav.
2. Fill the form:
   - **Subject Address**: auto-fills with your wallet address
   - **Metadata URI**: `ipfs://rwa-docs/acme` (or any string)
   - **Document Bundle Hash**: leave default or click **Hash URI**
3. Click **Submit Request** → confirm in MetaMask.
4. Wait for the green "Confirmed" banner. Note the **request ID** (e.g. `#3`).
5. Click **▶ Process with CRE Workflow →** to go to the Process page.

> At this point the request exists on-chain but has NOT been processed yet.

### Step 3: Process with CRE Workflow (`/process`) 

This is the magic step — **everything happens automatically from the browser.**

1. The `/process` page loads with your request ID pre-filled.
2. Fill the **Company Info** (defaults work: "Acme LLC", "USA", etc.).
3. Click **▶ Run CRE Workflow**.

**What happens behind the scenes (streamed live to the UI):**

```
Step 1  ▸ Preparing Payload         → Writes http-payload.local.json
Step 2  ▸ Syncing Block Timestamp   → Aligns Anvil clock with wall time
Step 3  ▸ CRE Workflow Engine       → Compiles + initializes simulator
Step 4  ▸ Reading On-Chain Request  → Reads request from DiligencePortal
Step 5  ▸ KYB Verification          → Calls Sumsub via x402 payment rail
Step 6  ▸ AI Risk Assessment        → Gemini analyzes KYB + document data
Step 7  ▸ Final Decision            → Merges KYB + AI scores
Step 8  ▸ Broadcasting On-Chain     → Calls RWAComplianceReceiver.onReport()
Step 9  ▸ On-Chain Side Effects     → 8 events: Compliance + ERC-8004
```

**Data cards appear in real-time** showing:
- **KYB**: provider=Sumsub, status=APPROVED, score=10/1000, x402 payment
- **Gemini AI**: approved=true, riskScore=150/1000, reasons list
- **Decision**: final verdict with combined risk score
- **On-chain write**: tx hash, block number, gas used, event count
- **Side effects**: list of all emitted events

> **No terminal commands needed.** The Next.js API route spawns the real `cre` CLI,
> streams stdout via SSE, then calls `onReport()` on-chain automatically.

### Step 4: Check Compliance (`/compliance`)

1. Go to **Compliance** tab.
2. Paste the subject address → click **Lookup**.
3. You should see:
   - **Status**: `APPROVED` 
   - **Risk Score**: e.g. `150 / 1000` (low = good)
   - **Last Updated**: a real timestamp
   - **Attestation**: hash like `0xc9bf26...`

### Step 5: Vault Operations (`/vault`)

The vault is **compliance-gated** — deposits only work if `ComplianceRegistry.isApproved(yourAddress)` is `true`.

1. **Mint dUSD**: click **Mint 10,000 dUSD** button on the Vault page.
2. **Approve Vault**: enter amount (e.g. `1000`) → click **Approve**.
3. **Deposit**: enter same amount → click **Deposit**.
4. Your vault shares increase and TVL updates.
5. **Withdraw**: enter shares to redeem → click **Withdraw**.

### Step 6: Agents (`/agents`)

- **Browse**: 2 bootstrap agents pre-registered (Reputation Agent #1, Validation Agent #2).
- **Register**: fill name/URI → click Register.
- **Feedback**: select agent → give a score.
- **Validation**: request validation → respond.

> **These agents were triggered automatically** during Step 3 by `onReport()`.
> See the [ERC-8004 Agents section](#erc-8004-agents--what-they-do) below.

---

## Testing the Agents Tab (step-by-step)

After running the CRE workflow at least once (Step 3), agents already have on-chain data.
Here's how to explore and interact with each sub-tab on `/agents`.

### Browse tab

1. Go to `/agents` → you should see **Agent #1** and **Agent #2**.
2. Click an agent row to **expand** it — you'll see:
   - **Owner**: the deployer address (Anvil account #0)
   - **Wallet**: the agent's linked wallet
   - **URI**: the metadata URI set during registration
   - **Validations**: count of validation requests for this agent
3. Agent badges:
   - `REP` — this is the Reputation agent used by `RWAComplianceReceiver`
   - `VAL` — this is the Validation agent used by `RWAComplianceReceiver`

### Register tab (create a new agent)

1. Switch to the **Register** tab.
2. Enter a metadata URI, e.g. `ipfs://my-custom-agent/metadata.json`.
3. Click **Register** → confirm in MetaMask.
4. Switch back to **Browse** — you'll see **Agent #3** appear.

### Feedback tab (write reputation scores)

This writes a reputation entry to `ReputationRegistry` for any agent.

1. Switch to **Feedback** tab.
2. Fill:
   - **Agent ID**: `1` (the Reputation agent)
   - **Value**: `80` (positive score = good reputation)
   - **tag1**: `quality` (category)
   - **tag2**: `rwa` (subcategory)
   - **endpoint**: `cre://workflow` (what triggered this feedback)
   - **feedbackURI**: `ipfs://feedback/manual-test`
3. Note the auto-generated **feedbackHash** at the bottom.
4. Click **Submit Feedback** → confirm in MetaMask.
5. The on-chain event `NewFeedback` fires — the agent's reputation is updated.

**What to try:**
- Give Agent #1 a **negative** value like `-500` to simulate a bad review
- Give Agent #2 feedback with tag1=`validation` to categorize it differently
- Give the newly registered Agent #3 its first reputation score

### Validate tab (request + respond to validations)

This tab has three sections:

**Request Validation:**
1. Enter **Validator address**: paste your own wallet address (or any address).
2. Enter **Agent ID**: `2` (the Validation agent).
3. Leave **Request URI** as default or set a custom one.
4. Note the auto-generated **request hash**.
5. Click **Request** → confirm in MetaMask.
6. Copy the **request hash** — you'll need it for the response.

**Respond to Validation:**
1. Paste the **request hash** from above.
2. Set **Response score**: `85` (out of 100, where 100 = fully validated).
3. Set **Tag**: `manual-test`.
4. Click **Respond** → confirm in MetaMask.

**Lookup Validation Status:**
1. Paste the same **request hash**.
2. Click **Lookup**.
3. You'll see:
   - **Validator**: the address that requested it
   - **Agent ID**: `2`
   - **Response**: `85/100`
   - **Tag**: `manual-test`
   - **Updated**: timestamp

> **Tip:** You can also look up validation hashes that were created automatically by
> the CRE workflow in Step 3. Check the process page's "Side Effects" section for
> the `ValidationResponse` event and copy its `requestHash` to look it up here.

---

## KYB Force-Approve Mode

By default, the KYB provider runs with `FORCE_APPROVE=true` in `services/kyb-provider/.env`.
This returns `APPROVED` with `providerScore=10` **without hitting the Sumsub API**.

To use the real Sumsub sandbox instead:
```bash
# In services/kyb-provider/.env, change:
FORCE_APPROVE=false
```
Note: Sumsub sandbox always returns `REJECTED` by default. You can force-approve in the
sandbox by calling the `/sumsub/sandbox/testCompleted` endpoint (see [anvil-base-sepolia-e2e.md](anvil-base-sepolia-e2e.md)).

---

## Quick Reference: What Each Page Reads On-Chain

| Page | Contract | Functions | Updates When |
|------|----------|-----------|--------------|
| **Dashboard** | DiligencePortal | `nextRequestId()` | After submit |
| | RWAVault | `totalAssets()`, `totalSupply()` | After deposit/withdraw |
| | IdentityRegistry | `nextAgentId()` | After agent registration |
| **Submit** | DiligencePortal | `submit()`, `getRequest()` | Real-time |
| **Process** | DiligencePortal | `getRequest()`, `nextRequestId()` | After submit |
| | API route → CRE CLI → `onReport()` | All contracts | After workflow run |
| **Compliance** | ComplianceRegistry | `getRecord()`, `isApproved()` | **After CRE workflow** |
| **Vault** | RWAVault | `totalAssets()`, `balanceOf()`, `deposit()`, `withdraw()` | After deposit/withdraw |
| | DemoUSD | `balanceOf()`, `allowance()`, `approve()`, `mint()` | After mint/approve |
| | ComplianceRegistry | `isApproved()` | **After CRE workflow** |
| **Agents** | IdentityRegistry | `nextAgentId()`, `getAgent()` | After registration |
| | ReputationRegistry | `getFeedback()`, `giveFeedback()` | After feedback / workflow |
| | ValidationRegistry | `validationRequest()`, `validationResponse()` | After validation / workflow |

