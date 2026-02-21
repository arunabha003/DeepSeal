# Anvil Base Sepolia Fork E2E (real Sumsub + real Gemini + x402 + ERC-8004)

This flow runs the protocol on an Anvil Base Sepolia fork using **CRE local simulation** plus real external integrations.

---

## Anvil Account Map

| # | Address | Private Key | Role |
|---|---------|-------------|------|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | **Deployer / Owner / CRE sender / Subject** |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | **x402 Buyer** (pays for KYB with forked USDC) |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | Available (test user) |
| 7 | `0x14dC79964da2C08dA15Fd353d30d9AA8CAF8a592` | `0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356` | Only clean EOA on Base Sepolia fork (no EIP-7702 code) |
| derived | `0x4e767bE56A8e70759544831e6e1825c94f945cE3` | `0x741a86b698ac6e746fc8df15e352e4c148ad970618c1085bd92b76b58e2daba3` | **Agent Registrar** (derived from `keccak256("RWA_AGENT_REGISTRAR_PRIVATE_KEY_V1")`) |




## ERC-8004 Agents

Agent IDs are minted by the IdentityRegistry at deploy time. Do not hardcode IDs.
Use `broadcast/Deploy.s.sol/<chain-id>/run-latest.json` (or deploy logs) for the
actual `ERC8004 ReputationAgentId` and `ERC8004 ValidationAgentId`.

---

## 0) Prerequisites
- `anvil`, `forge`, `cast` (Foundry)
- `cre` CLI + `bun`
- `services/kyb-provider/.env` filled with real Sumsub sandbox values
- `cre/chainlink-Convergence/.env` filled with `GEMINI_API_KEY`
- Sumsub level configured for business verification (`SUMSUB_LEVEL_NAME`)

## 1) Start Anvil on a Base Sepolia fork
```bash
anvil --fork-url https://sepolia.base.org --chain-id 84532 --host 127.0.0.1 --port 8545
```

## 2) Configure environment files

### `services/kyb-provider/.env`
```bash
X402_ENABLED=true
X402_NETWORK=base-sepolia
X402_PAY_TO=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266       # Account #0 (deployer receives payment)
X402_TIMEOUT_SECONDS=600
X402_RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # Account #0
X402_RPC_URL=http://127.0.0.1:8545
X402_EIP712_NAME=USDC
X402_EIP712_VERSION=2

SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_APP_TOKEN=<your_sumsub_app_token>
SUMSUB_SECRET_KEY=<your_sumsub_secret_key>
SUMSUB_LEVEL_NAME=<your_sumsub_level_name>

# Document resolver settings (secure metadataUri ingestion)
DOC_RESOLVER_API_KEY=<optional_shared_key>
DOC_RESOLVER_IPFS_GATEWAY=https://ipfs.io/ipfs
DOC_RESOLVER_ALLOW_INSECURE_HTTP=true
```

### `cre/chainlink-Convergence/.env`
```bash
CRE_ETH_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # Account #0 (deployer)
GEMINI_API_KEY=<your_gemini_api_key>
X402_BUYER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d  # Account #1 (buyer - has forked USDC)
DOC_RESOLVER_API_KEY=<same_optional_shared_key_if_used>

# ERC-8004 deployment mode (defaults shown)
USE_OFFICIAL_ERC8004=false
REGISTER_ERC8004_AGENTS=true
REPUTATION_AGENT_URI=
VALIDATION_AGENT_URI=

# Optional external registries (set when using official/shared registries)
# ERC8004_IDENTITY_REGISTRY=0x...
# ERC8004_REPUTATION_REGISTRY=0x...
# ERC8004_VALIDATION_REGISTRY=0x...
# ERC8004_REPUTATION_AGENT_ID=...
# ERC8004_VALIDATION_AGENT_ID=...
```

## 2.5) Clear EIP-7702 delegation code from Anvil accounts

On Base Sepolia, well-known Anvil accounts have EIP-7702 delegation
designators (`0xef01...`) at their addresses. This causes USDC
`SignatureChecker` to treat them as **contracts** instead of EOAs, breaking
`transferWithAuthorization`.

Clear **all affected accounts** in one shot:

```bash
for addr in \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
  0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
  0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc \
  0x976EA74026E726554dB657fA54763abd0C3a0aa9 \
  0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f \
  0xa0Ee7A142d267C1f36714E4a8F75612F20a79720; do
  curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"anvil_setCode","params":["'"$addr"'","0x"],"id":1}' \
    http://127.0.0.1:8545 > /dev/null
done
```

Verify:
```bash
cast code 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://127.0.0.1:8545  
cast code 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url http://127.0.0.1:8545  
```


## 3) Deploy contracts to Anvil fork
```bash

export RPC_URL=http://127.0.0.1:8545
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast
```

## 4) Auto-wire CRE config + sync secrets
```bash
node tools/sync-cre-config.mjs --chain-id 84532 --config cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json
node tools/sync-local-secrets-to-config.mjs --config cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json
node tools/sync-local-secrets-to-config.mjs --config cre/chainlink-Convergence/my-workflow/config.staging.json
```

> `sync-local-secrets-to-config.mjs` writes `GEMINI_API_KEY` and `X402_BUYER_PRIVATE_KEY` into workflow config files for local simulation fallback.
> Before any git commit, reset these files:
> ```bash
> git restore --worktree cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json
> git restore --worktree cre/chainlink-Convergence/my-workflow/config.staging.json
> ```

## 5) Sync frontend addresses
```bash
cd app && node scripts/sync-abis.mjs
```

## 6) Submit diligence request
```bash

# Compute the document bundle hash from an IPFS URI or local file:
node tools/hash-doc-bundle.mjs --file ./docs/acme-company-bundle.upload.json
# OR for already uploaded IPFS content:
# node tools/hash-doc-bundle.mjs --uri ipfs://<CID>/<filename>.json

export PORTAL_ADDRESS=$(jq -r '[.transactions[] | select(.contractName=="DiligencePortal")][0].contractAddress' broadcast/Deploy.s.sol/84532/run-latest.json)
export SUBJECT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export DOC_BUNDLE_HASH=<hash_from_tool_output>
export METADATA_URI=ipfs://<CID>/<path-to-doc-bundle.json>

forge script script/SubmitRequest.s.sol:SubmitRequest --rpc-url "$RPC_URL" --broadcast
```


## 7) Start KYB provider
```bash
cd services/kyb-provider
npm install && npm run dev
```

Verify Sumsub auth:

```bash
curl -s http://127.0.0.1:3001/sumsub/healthz | jq
```

Expected: `authValid: true`.

## 8) Preflight checks
```bash
cd /Users/arunabha003/Documents/Projects/Chainlink-Converegence
CRE_CONFIG_PATH=cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json RPC_URL=http://127.0.0.1:8545 node tools/readiness-check.mjs
```

## 9) Run CRE workflow simulation
```bash
cd cre/chainlink-Convergence

cat > ../../http-payload.local.json <<'EOF'
{
  "requestId": 1
}
EOF

PAYLOAD=$(jq -c . ../../http-payload.local.json)

# Sync block timestamp
CURRENT_TS=$(date +%s)
curl -s -X POST -H "Content-Type: application/json" \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"evm_setNextBlockTimestamp\",\"params\":[$CURRENT_TS],\"id\":1}" \
  http://127.0.0.1:8545 > /dev/null
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"evm_mine","params":[],"id":2}' \
  http://127.0.0.1:8545 > /dev/null

cre workflow simulate ./my-workflow \
  --target anvil-e2e-settings \
  --trigger-index 0 \
  --http-payload "$PAYLOAD" \
  --non-interactive \
  -e .env
```

Expected in local simulate:
- `Workflow Simulation Result` includes `txHash: "simulation-no-txhash"` (this is normal in local simulation mode).
- `Workflow Simulation Result` includes `extractionHash` and `documentSourceHash` proving document-derived processing.

## 10) Verify on-chain outcome
```bash
REGISTRY=0xC36E784E1dff616bDae4EAc7B310F0934FaF04a4
SUBJECT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

cast call $REGISTRY "isApproved(address)(bool)" $SUBJECT --rpc-url http://127.0.0.1:8545
cast call $REGISTRY "getRecord(address)((bool,uint32,bytes32,uint64))" $SUBJECT --rpc-url http://127.0.0.1:8545
```

## 11) Force Sumsub sandbox outcome (for approve-path demo)
```bash
curl -sS -X POST http://127.0.0.1:3001/kyb/free \
  -H 'content-type: application/json' \
  -d '{"subject":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","docBundleHash":"0x1111111111111111111111111111111111111111111111111111111111111111","metadataUri":"ipfs://rwa-docs/acme","companyInfo":{"companyName":"Acme LLC","country":"USA"}}' | jq
```
Copy `sumsub.applicantId`, then:
```bash
curl -sS -X POST http://127.0.0.1:3001/sumsub/sandbox/testCompleted \
  -H 'content-type: application/json' \
  -d '{"applicantId":"<APPLICANT_ID>","reviewAnswer":"GREEN"}' | jq
```
Rerun step 9 and 10.

---
