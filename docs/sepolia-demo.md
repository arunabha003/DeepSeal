# Sepolia demo runbook

End-to-end path:
1) deploy contracts
2) submit diligence request (onchain)
3) run KYB stub locally
4) simulate CRE workflow with HTTP trigger (Gemini + KYB stub) and broadcast the onchain `writeReport`
5) verify registry updated and vault deposit succeeds

## 1) Deploy contracts
```bash
export RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
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

## 3) Start KYB provider (local)
Preferred (x402-ready provider; use the free route for CRE simulation):
```bash
cd services/kyb-provider
npm install
# optional: enable x402 paywall on POST /kyb
# cp .env.example .env && edit X402_ENABLED=true and X402_PAY_TO=<your wallet>
npm run dev
```

Legacy stub (no x402):
```bash
node tools/kyb-stub/server.mjs
```

## 4) Configure CRE workflow + secrets
Edit:
- `cre/chainlink-Convergence/my-workflow/config.staging.json`
  - `diligencePortalAddress`
  - `receiverAddress`
  - `kybUrl` (defaults to `http://127.0.0.1:3001/kyb/free`)
  - Optional:
    - `useConfidentialHttp` (set true only if your CRE environment supports Confidential HTTP)
    - `x402Enabled` (set true if using the paywalled `POST /kyb` route and you’ve set `X402_BUYER_PRIVATE_KEY`)

Create `cre/chainlink-Convergence/.env` from `cre/chainlink-Convergence/.env.example`:
- `CRE_ETH_PRIVATE_KEY` (same key as above)
- `GEMINI_API_KEY`
 - Optional: `X402_BUYER_PRIVATE_KEY`

## 5) Simulate workflow (HTTP trigger) and broadcast
From `cre/chainlink-Convergence`:
```bash
export REQUEST_ID=1
cat > http-payload.local.json <<EOF
{ "requestId": $REQUEST_ID }
EOF

cre workflow simulate ./my-workflow --trigger-index 0 --http-payload ./http-payload.local.json --broadcast -e .env
```

If your `cre` CLI prompts interactively for the HTTP trigger input, paste JSON directly (e.g. `{"requestId": 1}`) or enter the file path `./http-payload.local.json`.

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
