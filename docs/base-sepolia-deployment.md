# Base Sepolia Live Deployment (real Sumsub + Gemini + x402 + ERC-8004)

This flow runs the full protocol on **real Base Sepolia** using CRE staging simulation, real external integrations, and live deployed contracts.

---

## Deployed Contract Addresses (Chain 84532)

| Contract | Address | Basescan |
|---|---|---|
| DemoUSD | `0x523E3033F844B1E2175183846ADFD7190EDECD4a` | [View](https://sepolia.basescan.org/address/0x523E3033F844B1E2175183846ADFD7190EDECD4a) |
| ComplianceRegistry | `0x78383225EA842251361CE7104456322d4d151D66` | [View](https://sepolia.basescan.org/address/0x78383225EA842251361CE7104456322d4d151D66) |
| DiligencePortal | `0xa5A29714cb9c51A10a165cBe2025372640abb9e5` | [View](https://sepolia.basescan.org/address/0xa5A29714cb9c51A10a165cBe2025372640abb9e5) |
| RWAComplianceReceiver | `0x16b1D017F22F2aB47bA3eA1948ff973A024CCB4F` | [View](https://sepolia.basescan.org/address/0x16b1D017F22F2aB47bA3eA1948ff973A024CCB4F) |
| RWAVault | `0x65054D2De227b7e823a0c13fc0C5D6c62198963d` | [View](https://sepolia.basescan.org/address/0x65054D2De227b7e823a0c13fc0C5D6c62198963d) |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | [View](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | [View](https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |
| ValidationRegistry | `0xa30004dfA091b5bD9B019Fa31b490847929555EC` | [View](https://sepolia.basescan.org/address/0xa30004dfA091b5bD9B019Fa31b490847929555EC) |

> **IdentityRegistry and ReputationRegistry are the official ERC-8004 registries** deployed by the 8004 team, shared across all projects on the chain.

## ERC-8004 Agents (Official Registry)

| Agent | ID | Name | 8004scan |
|---|---|---|---|
| Reputation Agent | `#916` | RWA Diligence Reputation Agent | [View](https://8004scan.vercel.app) |
| Validation Agent | `#917` | RWA Diligence Validation Agent | [View](https://8004scan.vercel.app) |

**EAS Schema UID:** `0x91f39675fa85b9340ba36983e388a4b9238c55ac7f593f2c87ba0c55115dd06a`

> Browse all agents: https://8004scan.vercel.app

---

## Account Map

| Role | Address | Notes |
|---|---|---|
| **Deployer / Owner** | `0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814` | Derived from deployer key |
| **x402 Buyer** | `0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814` | Same as deployer (clean EOA, no EIP-7702 code) |

> Keep private keys only in local `.env` files and never commit them.

---

## 0) Prerequisites
- `forge`, `cast` (Foundry)
- `cre` CLI + `bun`
- Node.js 18+
- Real Base Sepolia ETH in deployer wallet (get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet))
- Sumsub sandbox keys (or `FORCE_APPROVE=true`)
- Gemini API key (free from [aistudio.google.com](https://aistudio.google.com))

## 1) Deploy contracts to Base Sepolia

> **Skip this step if using the already-deployed contracts above.**

```bash
export RPC_URL=https://sepolia.base.org
export PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY>

USE_OFFICIAL_ERC8004=true \
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url https://base-sepolia.blockscout.com/api/
```

> This deploys 5 custom contracts and registers 2 ERC-8004 agents on the **official** Identity Registry (`0x8004A818...`). Agent IDs are auto-assigned.

## 2) Configure environment files

Copy `.example` files and fill in secrets:

```bash
cp .env.example .env
cp services/kyb-provider/.env.example services/kyb-provider/.env
cp cre/chainlink-Convergence/.env.example cre/chainlink-Convergence/.env
cp cre/chainlink-Convergence/my-workflow/config.staging.example.json \
   cre/chainlink-Convergence/my-workflow/config.staging.json
cp app/.env.local.example app/.env.local
```

In `config.staging.json`, keep these enabled for privacy-track behavior:
- `"environment": "staging"`
- `"useConfidentialHttp": true`
- `"enforceSensitiveConfidential": true`
- `"auditWebhookEnabled": true`
- `"auditWebhookRequired": true`

Fill in your API keys and private keys in each file. The `.example` files already contain testnet contract addresses — you only need to add secrets.

### Key secrets to fill

| File | Secrets |
|---|---|
| `.env` | `GEMINI_API_KEY` |
| `services/kyb-provider/.env` | `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `X402_PAY_TO`, `X402_RPC_URL`, `X402_RELAYER_PRIVATE_KEY` |
| `cre/chainlink-Convergence/.env` | `CRE_ETH_PRIVATE_KEY`, `GEMINI_API_KEY`, `X402_BUYER_PRIVATE_KEY` |
| `app/.env.local` | `DEPLOYER_PRIVATE_KEY`, `RPC_URL` |

### Sumsub setup (inlined)

Required `services/kyb-provider/.env` fields:
- `SUMSUB_BASE_URL=https://api.sumsub.com`
- `SUMSUB_APP_TOKEN=<your_app_token>`
- `SUMSUB_SECRET_KEY=<your_secret_key>`
- `SUMSUB_LEVEL_NAME=<your_business_level_name>`
- `PII_REDACTOR_API_KEY=<optional_shared_key_for_/pii/redact>`
- `AUDIT_WEBHOOK_API_KEY=<optional_shared_key_for_/audit/webhook>`

Auth verification:

```bash
cd services/kyb-provider
npm run check:sumsub
```

Or when server is running:

```bash
curl -s http://127.0.0.1:3001/sumsub/healthz | jq
```

Expected: `authValid: true`.

## 3) Update contract addresses (only if you redeployed)

If you redeployed, update the CRE config and frontend addresses:

```bash
node tools/sync-cre-config.mjs --chain-id 84532 --config cre/chainlink-Convergence/my-workflow/config.staging.json
```

## 4) Start KYB provider

```bash
cd services/kyb-provider
npm install && npm run dev
```

Verify:
```bash
curl -s http://127.0.0.1:3001/kyb -X POST -H 'content-type: application/json' -d '{}' | jq '.accepts[0].payTo'
```

## 5) Upload document bundle to IPFS and submit request

### Prepare the bundle

Edit `docs/acme-company-bundle.upload.json` with your company details and document hashes.

### Upload to IPFS

Use any pinning provider. Example with Pinata:
1. Open [Pinata](https://app.pinata.cloud) and sign in
2. Upload your company bundle JSON file
3. Copy the returned CID

### Compute `docBundleHash` and submit

```bash
export RPC_URL=https://sepolia.base.org
export PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY>
export PORTAL_ADDRESS=0xa5A29714cb9c51A10a165cBe2025372640abb9e5
export SUBJECT=0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814
export METADATA_URI=ipfs://<CID>/<filename>.json

# Compute the hash
node tools/hash-doc-bundle.mjs --uri "$METADATA_URI"
export DOC_BUNDLE_HASH=<hash_from_tool_output>

forge script script/SubmitRequest.s.sol:SubmitRequest \
  --rpc-url "$RPC_URL" \
  --broadcast
```

### What is persisted on-chain

- In `DiligencePortal` request: `subject`, `docBundleHash`, `metadataUri`
- In `ComplianceRegistry` record: `approved`, `riskScore`, `attestationHash`, `updatedAt`
- Full document contents remain off-chain (IPFS)

## 6) Run CRE workflow simulation (staging target)

```bash
cd cre/chainlink-Convergence

PAYLOAD='{"requestId":1}'

cre workflow simulate ./my-workflow \
  --target staging-settings \
  --trigger-index 0 \
  --http-payload "$PAYLOAD" \
  --non-interactive \
  -e .env
```

Expected output includes:
- Document resolver verification (`sourceHash`) + deterministic extraction (`extractionHash`)
- KYB check via x402 paywall → APPROVED (if `FORCE_APPROVE=true`)
- x402 settlement trace with a real payment tx hash (`x402 payment settled txHash=0x...`)
- Gemini LLM risk analysis → risk score
- On-chain write to ComplianceRegistry via RWAComplianceReceiver
- `providerStatus`, `providerScore`, and `x402TxHash` in `Workflow Simulation Result`
- `txHash: "simulation-no-txhash"` (normal for CRE simulation mode)

## 7) Verify on-chain outcome

```bash
REGISTRY=0x78383225EA842251361CE7104456322d4d151D66
SUBJECT=0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814

cast call $REGISTRY "isApproved(address)(bool)" $SUBJECT --rpc-url https://sepolia.base.org
cast call $REGISTRY "getRecord(address)((bool,uint32,bytes32,uint64))" $SUBJECT --rpc-url https://sepolia.base.org
```

## 8) Start the frontend

```bash
cd app
npm install && npm run dev
```

Open http://localhost:3000 — the UI shows the "Base Sepolia" network badge.

Key pages:
- **Dashboard** (`/`) — deployed contracts with Basescan links
- **Agents** (`/agents`) — ERC-8004 agents with 8004scan links
- **Submit** (`/submit`) — submit diligence requests
- **Compliance** (`/compliance`) — lookup compliance records
- **Vault** (`/vault`) — deposit/withdraw from RWA vault
- **Process** (`/process`) — run CRE workflow with live pipeline visualization

## 9) Check ERC-8004 agents on 8004scan

- All agents: https://8004scan.vercel.app
- Agent #916 (Reputation): https://8004scan.vercel.app
- Agent #917 (Validation): https://8004scan.vercel.app

---

## Quick Reference: Key Verification Links

| What | Link |
|---|---|
| ComplianceRegistry | https://sepolia.basescan.org/address/0x78383225EA842251361CE7104456322d4d151D66 |
| IdentityRegistry (official) | https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e |
| ReputationRegistry (official) | https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713 |
| ValidationRegistry | https://sepolia.basescan.org/address/0xa30004dfA091b5bD9B019Fa31b490847929555EC |
| 8004scan | https://8004scan.vercel.app |

---

## Troubleshooting

### x402 `invalid_exact_evm_payload_signature`

This error means the x402 facilitator's signature verification failed. The most common cause on real testnets is **EIP-7702 delegation code** on the buyer address.

Well-known Anvil private keys (account #0 `0xf39F...`, account #1 `0x7099...`, etc.) are used by many developers and often have EIP-7702 delegation designators (`0xef01...`) set on public testnets. This causes viem's `verifyTypedData` to attempt ERC-1271 (contract) signature verification instead of `ecrecover`, which fails.

**Fix:** Use a private key whose address is a clean EOA (no code at the address). Verify with:
```bash
cast code <address> --rpc-url https://sepolia.base.org
# Should return 0x (empty)
```

### Agent IDs on 8004scan

The official ERC-8004 IdentityRegistry auto-increments agent IDs. If you see agents with IDs different from what the deploy script logged, check:
1. The **broadcast file**: `jq '.transactions[]' broadcast/Deploy.s.sol/84532/run-latest.json`
2. The **on-chain receiver config**: `cast call <receiver> "reputationAgentId()(uint256)"` and `"validationAgentId()(uint256)"`
3. Earlier deployments may have registered agents with lower IDs under the same registrar address.
