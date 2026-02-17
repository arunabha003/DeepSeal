# Anvil Base Sepolia Fork E2E (real Sumsub + real Gemini)

This flow runs the full protocol locally on an Anvil fork, with real external integrations (no KYB/LLM mocks).

## 0) Prerequisites
- `anvil`, `forge`, `cast`
- `cre` CLI + `bun`
- `services/kyb-provider/.env` filled with real Sumsub sandbox values
- `cre/chainlink-Convergence/.env` filled with `GEMINI_API_KEY`

## 1) Start Anvil on a Base Sepolia fork
```bash
anvil --fork-url https://sepolia.base.org --chain-id 84532 --host 127.0.0.1 --port 8545
```

Use Anvil account #0 private key as:
- deployer key (`PRIVATE_KEY`)
- workflow sender key (`CRE_ETH_PRIVATE_KEY`)

## 2) Configure KYB provider for free-route e2e first
`services/kyb-provider/.env`:
```bash
X402_ENABLED=false
X402_NETWORK=base-sepolia
KYB_PRICE=0.01
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET_KEY=...
SUMSUB_LEVEL_NAME=...
```

## 3) Deploy contracts to Anvil fork
```bash
export RPC_URL=http://127.0.0.1:8545
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast
```

## 4) Auto-wire CRE config with deployed addresses
```bash
node tools/sync-cre-config.mjs --chain-id 84532 --config cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json
```

## 5) Submit diligence request
```bash
export PORTAL_ADDRESS=$(jq -r '.transactions[] | select(.contractName=="DiligencePortal") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)

export SUBJECT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export DOC_BUNDLE_HASH=0x1111111111111111111111111111111111111111111111111111111111111111
export METADATA_URI=ipfs://rwa-docs/acme

forge script script/SubmitRequest.s.sol:SubmitRequest --rpc-url "$RPC_URL" --broadcast
```

Read the printed `RequestId`.

## 6) Start provider + validate Sumsub auth
```bash
cd services/kyb-provider
npm install
npm run check:sumsub
npm run dev
```

Keep this terminal running.

## 7) Configure CRE env for local simulation
`cre/chainlink-Convergence/.env`:
```bash
CRE_ETH_PRIVATE_KEY=0x<anvil_account_0_private_key>
GEMINI_API_KEY=<your_gemini_key>
# optional for paid x402 path later
X402_BUYER_PRIVATE_KEY=0x<base_sepolia_funded_buyer_key>
```

If `cre secrets` fails due `owner not linked`, set local fallback keys directly in
`cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json`:
- `geminiApiKey`
- `x402BuyerPrivateKey` (only needed when `x402Enabled=true`)

## 8) Preflight checks
```bash
cd /Users/arunabha003/Documents/Projects/Chainlink-Converegence
CRE_CONFIG_PATH=cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json RPC_URL=http://127.0.0.1:8545 node tools/readiness-check.mjs
```

## 9) Run CRE workflow simulation (non-interactive)
```bash
cd cre/chainlink-Convergence
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

cre workflow simulate ./my-workflow \
  --target anvil-e2e-settings \
  --trigger-index 0 \
  --http-payload ./http-payload.local.json \
  --non-interactive \
  -e .env
```

## 10) Verify protocol outcome onchain
```bash
export REGISTRY_ADDRESS=$(jq -r '.transactions[] | select(.contractName=="ComplianceRegistry") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export VAULT_ADDRESS=$(jq -r '.transactions[] | select(.contractName=="RWAVault") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export ASSET_ADDRESS=$(jq -r '.transactions[] | select(.contractName=="DemoUSD") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)

cast call "$REGISTRY_ADDRESS" "isApproved(address)(bool)" "$SUBJECT" --rpc-url "$RPC_URL"
cast send "$ASSET_ADDRESS" "approve(address,uint256)(bool)" "$VAULT_ADDRESS" 1000000 --private-key "$PRIVATE_KEY" --rpc-url "$RPC_URL"
cast send "$VAULT_ADDRESS" "deposit(uint256,address)(uint256)" 1000000 "$SUBJECT" --private-key "$PRIVATE_KEY" --rpc-url "$RPC_URL"
```

Expected:
- before workflow write: `isApproved=false`, deposit reverts
- after workflow write: `isApproved=true`, deposit succeeds

## 11) Switch to paid x402 path (next)
After the free-route e2e passes:
1. set `X402_ENABLED=true` in `services/kyb-provider/.env`
2. set `X402_PAY_TO=<your base-sepolia address>`
3. change workflow run target to `staging-settings` (uses `/kyb` and `x402Enabled=true`)
4. ensure `X402_BUYER_PRIVATE_KEY` is set in `cre/chainlink-Convergence/.env`
