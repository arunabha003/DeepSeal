# Anvil Base Sepolia Fork E2E (real Sumsub + real Gemini + x402 + ERC-8004)

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

## 2) Configure KYB provider mode
`services/kyb-provider/.env`:
```bash
X402_ENABLED=true
X402_NETWORK=base-sepolia
X402_PAY_TO=0x<your_base_sepolia_wallet>
KYB_PRICE=0.01
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET_KEY=...
SUMSUB_LEVEL_NAME=...
```

For free-path smoke tests only, set `X402_ENABLED=false` and keep workflow `kybUrl` on `/kyb/free`.

## 2.5) Clear EIP-7702 delegation code from Anvil accounts

On Base Sepolia, several well-known Anvil accounts have EIP-7702 delegation
designators (`0xef01…`) deployed at their addresses. This causes the USDC
`SignatureChecker` to treat them as **contracts** rather than EOAs, making
`transferWithAuthorization` / `permit` fail with "invalid signature".

Clear the code for the **actual buyer address** and deployer:

```bash
# Resolve buyer from your configured x402 buyer private key
export X402_BUYER_PRIVATE_KEY=0x<your_x402_buyer_private_key>
export BUYER_ADDRESS=$(cast wallet address --private-key "$X402_BUYER_PRIVATE_KEY")

# Buyer
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"anvil_setCode","params":["'"$BUYER_ADDRESS"'","0x"],"id":1}' \
  http://127.0.0.1:8545

# Deployer / relayer – account #0
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"anvil_setCode","params":["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","0x"],"id":2}' \
  http://127.0.0.1:8545
```

Verify with `cast code <address> --rpc-url http://127.0.0.1:8545` — should return `0x`.

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
# required for paid x402 buyer flow
X402_BUYER_PRIVATE_KEY=0x<base_sepolia_funded_buyer_key>
```

If `cre secrets` fails due `owner not linked`, set local fallback keys directly in
`cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json`:
- `geminiApiKey`
- `x402BuyerPrivateKey` (required when `x402Enabled=true`)

Recommended helper (copies from `cre/chainlink-Convergence/.env`):
```bash
cd /Users/arunabha003/Documents/Projects/Chainlink-Converegence
node tools/sync-local-secrets-to-config.mjs
```

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

PAYLOAD=$(jq -c . ./http-payload.local.json)
cre workflow simulate ./my-workflow --target anvil-e2e-settings --trigger-index 0 --http-payload "$PAYLOAD" --non-interactive -e .env
```

Notes:
- Passing compact inline JSON (`$PAYLOAD`) avoids CLI path parsing quirks seen with `--http-payload ./file.json`.
- If you see `Configured geminiModel=... unavailable. Retrying with model=...`, that fallback is expected.

## 10) Verify protocol + ERC-8004 outcome onchain
```bash
export REGISTRY_ADDRESS=$(jq -r '.transactions[] | select(.contractName=="ComplianceRegistry") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export VAULT_ADDRESS=$(jq -r '.transactions[] | select(.contractName=="RWAVault") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export ASSET_ADDRESS=$(jq -r '.transactions[] | select(.contractName=="DemoUSD") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export RECEIVER_ADDRESS=$(jq -r '.transactions[] | select(.contractName=="RWAComplianceReceiver") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export REPUTATION_REGISTRY=$(jq -r '.transactions[] | select(.contractName=="ReputationRegistry") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export VALIDATION_REGISTRY=$(jq -r '.transactions[] | select(.contractName=="ValidationRegistry") | .contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export REPUTATION_AGENT_ID=$(cast call "$RECEIVER_ADDRESS" "reputationAgentId()(uint256)" --rpc-url "$RPC_URL")
export VALIDATION_AGENT_ID=$(cast call "$RECEIVER_ADDRESS" "validationAgentId()(uint256)" --rpc-url "$RPC_URL")

cast call "$REGISTRY_ADDRESS" "isApproved(address)(bool)" "$SUBJECT" --rpc-url "$RPC_URL"
cast call "$REGISTRY_ADDRESS" "getRecord(address)((bool,uint32,bytes32,uint64))" "$SUBJECT" --rpc-url "$RPC_URL"
cast send "$ASSET_ADDRESS" "approve(address,uint256)(bool)" "$VAULT_ADDRESS" 1000000 --private-key "$PRIVATE_KEY" --rpc-url "$RPC_URL"
cast send "$VAULT_ADDRESS" "deposit(uint256,address)(uint256)" 1000000 "$SUBJECT" --private-key "$PRIVATE_KEY" --rpc-url "$RPC_URL"

cast call "$REPUTATION_REGISTRY" "getLastIndex(uint256,address)(uint64)" "$REPUTATION_AGENT_ID" "$RECEIVER_ADDRESS" --rpc-url "$RPC_URL"
cast call "$VALIDATION_REGISTRY" "getAgentValidations(uint256)(bytes32[])" "$VALIDATION_AGENT_ID" --rpc-url "$RPC_URL"

# optional deep read
export REPUTATION_CLIENT="$RECEIVER_ADDRESS"
forge script script/ReadERC8004State.s.sol:ReadERC8004State --rpc-url "$RPC_URL"
```

Expected:
- before workflow write: `isApproved=false`, deposit reverts
- after workflow write: `isApproved=true`, deposit succeeds
- local simulate may return `txHash=simulation-no-txhash` (or older zero-hash logs); rely on registry reads above for proof.
- after workflow write, ERC-8004 reputation feedback and validation status are recorded by `RWAComplianceReceiver`.

## 11) If x402 payment fails
- Ensure `services/kyb-provider` is running with `X402_ENABLED=true`.
- Ensure workflow config uses `/kyb` (not `/kyb/free`) and `x402Enabled=true`.
- Ensure `X402_BUYER_PRIVATE_KEY` has spendable balance on Base Sepolia.
- Verify provider returns `402` on first call and then `200` after buyer retry with `X-PAYMENT`.

## 12) Force Sumsub sandbox outcome (for approve-path demo)
If KYB stays `REJECTED`/pending, mark the sandbox applicant completed with `GREEN`:
```bash
curl -sS -X POST http://127.0.0.1:3001/kyb/free \
  -H 'content-type: application/json' \
  -d '{"subject":"'"$SUBJECT"'","docBundleHash":"'"$DOC_BUNDLE_HASH"'","metadataUri":"'"$METADATA_URI"'","companyInfo":{"companyName":"Acme LLC","country":"USA"}}' | jq
```
Copy `sumsub.applicantId` from response, then:
```bash
curl -sS -X POST http://127.0.0.1:3001/sumsub/sandbox/testCompleted \
  -H 'content-type: application/json' \
  -d '{"applicantId":"<APPLICANT_ID>","reviewAnswer":"GREEN"}' | jq
```
Rerun step 9 and step 10.
