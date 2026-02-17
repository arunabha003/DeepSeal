# Sepolia demo runbook

For local Anvil fork e2e first, use `docs/anvil-base-sepolia-e2e.md`.

End-to-end path:
1) deploy contracts
2) submit diligence request (onchain)
3) run Sumsub-backed KYB provider locally
4) simulate CRE workflow with HTTP trigger (Gemini + Sumsub KYB) and broadcast the onchain `writeReport`
5) verify registry updated and vault deposit succeeds

## 1) Deploy contracts
```bash
export RPC_URL='https://sepolia.base.org'
export PRIVATE_KEY='0x...'

# Optional hardening (leave unset for now)
export CRE_REPORT_FORWARDER='0x0000000000000000000000000000000000000000'
export CRE_WORKFLOW_ID='0x0000000000000000000000000000000000000000000000000000000000000000'
export CRE_WORKFLOW_AUTHOR='0x0000000000000000000000000000000000000000'
export CRE_WORKFLOW_NAME='0x0000000000000000000000000000000000000000000000000000000000000000'

forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast
```

Record the deployed addresses printed by the script:
- `DiligencePortal`
- `RWAComplianceReceiver`
- `ComplianceRegistry`
- `RWAVault`
- `ERC8004 IdentityRegistry`
- `ERC8004 ReputationRegistry`
- `ERC8004 ValidationRegistry`

## 2) Submit an onchain diligence request
```bash
export PORTAL_ADDRESS='0x...'
export SUBJECT='0x...'
export DOC_BUNDLE_HASH='0x...32bytes'
export METADATA_URI='ipfs://...'

forge script script/SubmitRequest.s.sol:SubmitRequest --rpc-url "$RPC_URL" --broadcast
```

Note the `RequestId` from the script output.

## 3) Start KYB provider (local, Sumsub-backed)
For Anvil/fork e2e, start with free mode (`/kyb/free`, `X402_ENABLED=false`).
For Base Sepolia paid flow, use paywalled mode (`/kyb`, `X402_ENABLED=true`).
```bash
cd services/kyb-provider
npm install
# configure SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_LEVEL_NAME, X402_PAY_TO in .env
# cp .env.example .env
npm run dev
```

Check Sumsub auth quickly:
```bash
cd services/kyb-provider
npm run check:sumsub
```

Or via server endpoint:
```bash
curl -s http://127.0.0.1:3001/sumsub/healthz | jq
```

## 4) Configure CRE workflow + secrets
Edit:
- `cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json` for Anvil/fork dry run
- `cre/chainlink-Convergence/my-workflow/config.staging.json` for Base Sepolia paid path
  - `diligencePortalAddress`
  - `receiverAddress`
  - `kybUrl` (`/kyb/free` for free mode, `/kyb` for paid mode)
  - Optional:
    - `useConfidentialHttp` (set true only if your CRE environment supports Confidential HTTP)
    - `x402Enabled` (false for free mode, true for paid `POST /kyb`)

Create `cre/chainlink-Convergence/.env` from `cre/chainlink-Convergence/.env.example`:
- `CRE_ETH_PRIVATE_KEY` (same key as above)
- `GEMINI_API_KEY`
- `X402_BUYER_PRIVATE_KEY` (buyer wallet for x402 retries)
- If CRE secrets are unavailable for your org (`owner not linked`), use local config fallback:
  - `node tools/sync-local-secrets-to-config.mjs`

Run readiness checks before simulation:
```bash
node tools/readiness-check.mjs
```

## 5) Simulate workflow (HTTP trigger) and broadcast
From `cre/chainlink-Convergence`:
```bash
export REQUEST_ID=1
cat > http-payload.local.json <<EOF
{ "requestId": $REQUEST_ID }
EOF

# Anvil/fork e2e (free KYB route)
PAYLOAD=$(jq -c . ./http-payload.local.json)
cre workflow simulate ./my-workflow --target anvil-e2e-settings --trigger-index 0 --http-payload "$PAYLOAD" -e .env

# Base Sepolia paid path
cre workflow simulate ./my-workflow --target staging-settings --trigger-index 0 --http-payload ./http-payload.local.json --broadcast -e .env
```

If your `cre` CLI prompts interactively for the HTTP trigger input, paste JSON directly (e.g. `{"requestId": 1}`) or enter the file path `./http-payload.local.json`.

If you are using Sumsub and want the KYB provider to create a sandbox applicant automatically, include `companyInfo` in the payload. See `docs/sumsub-setup.md`.

## 6) Verify onchain state + vault gate
Read approval status:
```bash
export REGISTRY_ADDRESS='0x...'
export SUBJECT='0x...'
cast call "$REGISTRY_ADDRESS" "isApproved(address)(bool)" "$SUBJECT" --rpc-url "$RPC_URL"
```

Attempt a vault deposit (should revert before approval, succeed after):
```bash
export VAULT_ADDRESS='0x...'
export ASSET_ADDRESS='0x...'

# Approve spending
cast send "$ASSET_ADDRESS" "approve(address,uint256)(bool)" "$VAULT_ADDRESS" 1000000 --private-key "$PRIVATE_KEY" --rpc-url "$RPC_URL"

# Deposit
cast send "$VAULT_ADDRESS" "deposit(uint256,address)(uint256)" 1000000 "$SUBJECT" --private-key "$PRIVATE_KEY" --rpc-url "$RPC_URL"
```
