# Deploy on Base Sepolia + Test with Local CRE Simulation

This guide covers the exact flow to:
1) deploy contracts on **Base Sepolia** (real chain), and
2) test the workflow with **local CRE simulation** (real Sumsub + Gemini + optional x402).

---

## 1) Prerequisites

- Foundry (`forge`, `cast`)
- CRE CLI + Bun
- Running KYB provider (`services/kyb-provider`)
- `cre/chainlink-Convergence/.env` configured:
  - `CRE_ETH_PRIVATE_KEY` (funded on Base Sepolia)
  - `GEMINI_API_KEY`
  - `X402_BUYER_PRIVATE_KEY` (only if `x402Enabled=true`)

---

## 2) Deploy contracts on Base Sepolia

From repo root:

```bash
export RPC_URL=https://sepolia.base.org
export PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY>

# Optional ERC-8004 mode:
# export USE_OFFICIAL_ERC8004=true
# export REGISTER_ERC8004_AGENTS=true

forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast
```

Save these from deploy logs (or broadcast json):
- `DiligencePortal`
- `RWAComplianceReceiver`
- `ComplianceRegistry`
- `ERC8004 ReputationAgentId`
- `ERC8004 ValidationAgentId`

---

## 3) Sync workflow config to deployed addresses

```bash
cd /Users/arunabha003/Documents/Projects/Chainlink-Converegence

node tools/sync-cre-config.mjs \
  --chain-id 84532 \
  --config cre/chainlink-Convergence/my-workflow/config.staging.json
```

Then verify `cre/chainlink-Convergence/my-workflow/config.staging.json`:
- `chainSelectorName = "ethereum-testnet-sepolia-base-1"`
- `diligencePortalAddress` = deployed portal
- `receiverAddress` = deployed receiver
- `kybUrl` points to your local provider:
  - free: `http://127.0.0.1:3001/kyb/free`
  - paid x402: `http://127.0.0.1:3001/kyb`

---

## 4) Inject local secrets fallback (if CRE linked secrets unavailable)

```bash
node tools/sync-local-secrets-to-config.mjs \
  --env cre/chainlink-Convergence/.env \
  --config cre/chainlink-Convergence/my-workflow/config.staging.json
```

This writes `geminiApiKey` and `x402BuyerPrivateKey` into the selected config for local simulation.

---

## 5) Submit an on-chain diligence request

```bash
export RPC_URL=https://sepolia.base.org
export PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY>
export PORTAL_ADDRESS=<DEPLOYED_DILIGENCE_PORTAL>
export SUBJECT=<WALLET_TO_SCORE>
export DOC_BUNDLE_HASH=0x1111111111111111111111111111111111111111111111111111111111111111
export METADATA_URI=ipfs://rwa-docs/acme

forge script script/SubmitRequest.s.sol:SubmitRequest --rpc-url "$RPC_URL" --broadcast
```

Take note of `requestId`.

---

## 6) Start local KYB provider

```bash
cd services/kyb-provider
npm install
npm run dev
```

Health check:

```bash
curl -sf http://127.0.0.1:3001/healthz
```

---

## 7) Run CRE local simulation against deployed contracts

From `cre/chainlink-Convergence`:

```bash
cat > http-payload.local.json <<'EOF'
{
  "requestId": 1,
  "companyInfo": {
    "companyName": "Acme LLC",
    "country": "USA",
    "registrationNumber": "1234567",
    "website": "https://acme.example"
  }
}
EOF

PAYLOAD=$(jq -c . ./http-payload.local.json)

cre workflow simulate ./my-workflow \
  --target staging-settings \
  --trigger-index 0 \
  --http-payload "$PAYLOAD" \
  --non-interactive \
  -e .env
```

Notes:
- This is local CRE engine execution with real external APIs.
- Local simulation can return `simulation-no-txhash`; that is expected in simulator mode.

---

## 8) Validate result on-chain

```bash
export RPC_URL=https://sepolia.base.org
export REGISTRY=<DEPLOYED_COMPLIANCE_REGISTRY>
export SUBJECT=<WALLET_TO_SCORE>

cast call "$REGISTRY" "isApproved(address)(bool)" "$SUBJECT" --rpc-url "$RPC_URL"
cast call "$REGISTRY" "getRecord(address)((bool,uint32,bytes32,uint64))" "$SUBJECT" --rpc-url "$RPC_URL"
```

If you are using the frontend process route (`/process`), it applies `onReport()` on-chain after simulation and you should see the updated record immediately.

---

## 9) Optional: verify ERC-8004 side effects

Use the deployed registries + agent IDs from deploy output:

```bash
export REPUTATION_REGISTRY=<DEPLOYED_REPUTATION_REGISTRY>
export VALIDATION_REGISTRY=<DEPLOYED_VALIDATION_REGISTRY>
export REPUTATION_AGENT_ID=<FROM_DEPLOY_LOG>
export VALIDATION_AGENT_ID=<FROM_DEPLOY_LOG>
export CLIENT_ADDRESS=<RECEIVER_OR_CALLER>

cast call "$REPUTATION_REGISTRY" "getLastIndex(uint256,address)(uint64)" "$REPUTATION_AGENT_ID" "$CLIENT_ADDRESS" --rpc-url "$RPC_URL"
cast call "$VALIDATION_REGISTRY" "getAgentValidations(uint256)(bytes32[])" "$VALIDATION_AGENT_ID" --rpc-url "$RPC_URL"
```

---

## 10) Common failure points

- `Cannot decode zero data ("0x")`: wrong `diligencePortalAddress`, wrong `requestId`, or request not submitted on that chain.
- `secret not found`: run `sync-local-secrets-to-config.mjs` with the same config file used for simulation.
- `connection refused` to KYB URL: local provider not running.
- x402 failures on forked Anvil are different from Base Sepolia behavior; for live-chain test use `staging-settings`.

