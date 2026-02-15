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

## 2) Submit an onchain diligence request
```bash
export PORTAL_ADDRESS='0x...'
export SUBJECT='0x...'
export DOC_BUNDLE_HASH='0x...32bytes'
export METADATA_URI='ipfs://...'

forge script script/SubmitRequest.s.sol:SubmitRequest --rpc-url "$RPC_URL" --broadcast
```

Note the `RequestId` from the script output.

## 3) Start KYB stub (local)
```bash
node tools/kyb-stub/server.mjs
```

## 4) Configure CRE workflow + secrets
Edit:
- `cre/chainlink-Convergence/my-workflow/config.staging.json`
  - `diligencePortalAddress`
  - `receiverAddress`

Create `cre/chainlink-Convergence/.env` from `cre/chainlink-Convergence/.env.example`:
- `CRE_ETH_PRIVATE_KEY` (same key as above)
- `GEMINI_API_KEY`

## 5) Simulate workflow (HTTP trigger) and broadcast
From `cre/chainlink-Convergence`:
```bash
export REQUEST_ID=1
cat > http-payload.local.json <<EOF
{ "requestId": $REQUEST_ID }
EOF

cre workflow simulate ./my-workflow --trigger-index 0 --http-payload @./http-payload.local.json --broadcast -e .env
```

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

