# Base Sepolia Live Deployment (real Sumsub + Gemini + x402 + ERC-8004)

This flow runs the full protocol on **real Base Sepolia** using CRE staging simulation, real external integrations, and live deployed contracts.

---

## Deployed Contract Addresses (Chain 84532)

| Contract | Address | Basescan |
|---|---|---|
| DemoUSD | `0xFb2518e2017b36f00827409153818747A3e6d3f9` | [View](https://sepolia.basescan.org/address/0xFb2518e2017b36f00827409153818747A3e6d3f9) |
| ComplianceRegistry | `0x590552A4d4eF77F3AbD25C76fA8f304f2388b9e5` | [View](https://sepolia.basescan.org/address/0x590552A4d4eF77F3AbD25C76fA8f304f2388b9e5) |
| DiligencePortal | `0x337c75270D09A8D8BFCe386F93715E230b39E48c` | [View](https://sepolia.basescan.org/address/0x337c75270D09A8D8BFCe386F93715E230b39E48c) |
| RWAComplianceReceiver | `0x7cbFd330F61723c215c5061eD3b1A75CCCbF4e42` | [View](https://sepolia.basescan.org/address/0x7cbFd330F61723c215c5061eD3b1A75CCCbF4e42) |
| RWAVault | `0xF1DBec54913B58f65806C7F77D636b3f40882293` | [View](https://sepolia.basescan.org/address/0xF1DBec54913B58f65806C7F77D636b3f40882293) |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | [View](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | [View](https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |
| ValidationRegistry | `0x7ba22271A22D84807C501bCb6deeF76966262BE6` | [View](https://sepolia.basescan.org/address/0x7ba22271A22D84807C501bCb6deeF76966262BE6) |

> **IdentityRegistry and ReputationRegistry are the official ERC-8004 registries** deployed by the 8004 team, shared across all projects on the chain.

## ERC-8004 Agents (Official Registry)

| Agent | ID | Name | 8004scan |
|---|---|---|---|
| Reputation Agent | `#879` | RWA Diligence Reputation Agent | [View](https://testnet.8004scan.io/agents/base-sepolia/879) |
| Validation Agent | `#880` | RWA Diligence Validation Agent | [View](https://testnet.8004scan.io/agents/base-sepolia/880) |

Agent registrar address: `0x4e767bE56A8e70759544831e6e1825c94f945cE3`

> Browse all agents: https://testnet.8004scan.io/agents

---

## Account Map

| Role | Address | Notes |
|---|---|---|
| **Deployer / Owner** | `0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814` | Derived from deployer key |
| **Agent Registrar** | `0x4e767bE56A8e70759544831e6e1825c94f945cE3` | Derived from `keccak256("RWA_AGENT_REGISTRAR_PRIVATE_KEY_V1")` |
| **x402 Buyer** | `0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814` | Same as deployer (clean EOA, no EIP-7702 code) |

> Keep private keys only in local `.env` files and never commit them.

---

## 0) Prerequisites
- `forge`, `cast` (Foundry)
- `cre` CLI + `bun`
- Node.js 18+
- Real Base Sepolia ETH in deployer wallet (get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet))
- Sumsub sandbox keys (or `FORCE_APPROVE=true`)
- Gemini API key

## 1) Deploy contracts to Base Sepolia

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

### `cre/chainlink-Convergence/.env`
```bash
CRE_ETH_PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY>
CRE_TARGET=staging-settings
GEMINI_API_KEY=<your_gemini_api_key>
X402_BUYER_PRIVATE_KEY=<X402_BUYER_PRIVATE_KEY>
X402_BUYER_ADDRESS=<X402_BUYER_WALLET_ADDRESS>
X402_PAY_TO=<X402_RECIPIENT_ADDRESS>
```

### `cre/chainlink-Convergence/my-workflow/config.staging.json`
```json
{
  "chainSelectorName": "ethereum-testnet-sepolia-base-1",
  "diligencePortalAddress": "0x337c75270D09A8D8BFCe386F93715E230b39E48c",
  "receiverAddress": "0x7cbFd330F61723c215c5061eD3b1A75CCCbF4e42",
  "gasLimit": "1000000",
  "kybUrl": "http://127.0.0.1:3001/kyb",
  "documentResolverUrl": "http://127.0.0.1:3001/docs/resolve",
  "geminiModel": "gemini-2.5-flash",
  "geminiApiKey": "<your_gemini_api_key>",
  "x402BuyerPrivateKey": "",
  "useConfidentialHttp": false,
  "x402Enabled": true
}
```

### `services/kyb-provider/.env`
```bash
PORT=3001
FORCE_APPROVE=true               # Set false for real Sumsub flow
X402_ENABLED=true
X402_NETWORK=base-sepolia
X402_PAY_TO=<X402_RECIPIENT_ADDRESS>
KYB_PRICE=0.01
X402_TIMEOUT_SECONDS=600
X402_RELAYER_PRIVATE_KEY=<X402_RELAYER_PRIVATE_KEY>
X402_RPC_URL=https://sepolia.base.org
X402_EIP712_NAME=USDC
X402_EIP712_VERSION=2
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_APP_TOKEN=<your_sumsub_app_token>
SUMSUB_SECRET_KEY=<your_sumsub_secret_key>
SUMSUB_LEVEL_NAME=id-and-liveness
```

### `app/.env.local`
```bash
NEXT_PUBLIC_NETWORK=testnet
DEPLOYER_PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY>
RPC_URL=https://sepolia.base.org
```

## 3) Update contract addresses in frontend

If you redeploy, update the `TESTNET_ADDRESSES` in `app/src/lib/addresses.ts` to match
the new deployment, or use the auto-sync tool:

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

## 5) Submit a diligence request on-chain

```bash
export RPC_URL=https://sepolia.base.org
export PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY>
export PORTAL_ADDRESS=0x337c75270D09A8D8BFCe386F93715E230b39E48c
export SUBJECT=0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814
node tools/hash-doc-bundle.mjs --uri ipfs://<CID>/<path-to-doc-bundle.json>
export DOC_BUNDLE_HASH=<hash_from_tool_output>
export METADATA_URI=ipfs://<CID>/<path-to-doc-bundle.json>

forge script script/SubmitRequest.s.sol:SubmitRequest \
  --rpc-url "$RPC_URL" \
  --broadcast
```

## 6) Run CRE workflow simulation (staging target)

```bash
cd cre/chainlink-Convergence

# Build the HTTP payload
cat > ../../http-payload.local.json <<'EOF'
{ "requestId": 1 }
EOF

PAYLOAD=$(jq -c . ../../http-payload.local.json)

cre workflow simulate ./my-workflow \
  --target staging-settings \
  --trigger-index 0 \
  --http-payload "$PAYLOAD" \
  --non-interactive \
  -e .env
```

Expected output includes:
- document resolver verification (`sourceHash`) + deterministic extraction (`extractionHash`)
- KYB check via x402 paywall → APPROVED (if `FORCE_APPROVE=true`)
- Gemini LLM risk analysis → risk score
- On-chain write to ComplianceRegistry via RWAComplianceReceiver
- `txHash: "simulation-no-txhash"` (normal for CRE simulation mode)

## 7) Verify on-chain outcome

```bash
REGISTRY=0x590552A4d4eF77F3AbD25C76fA8f304f2388b9e5
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

- All agents: https://testnet.8004scan.io/agents
- Agent #879 (Reputation): https://testnet.8004scan.io/agents/base-sepolia/879
- Agent #880 (Validation): https://testnet.8004scan.io/agents/base-sepolia/880

---

## Quick Reference: Key Verification Links

| What | Link |
|---|---|
| ComplianceRegistry | https://sepolia.basescan.org/address/0x590552A4d4eF77F3AbD25C76fA8f304f2388b9e5 |
| IdentityRegistry (official) | https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e |
| ReputationRegistry (official) | https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713 |
| ValidationRegistry | https://sepolia.basescan.org/address/0x7ba22271A22D84807C501bCb6deeF76966262BE6 |
| Agent #879 (8004scan) | https://testnet.8004scan.io/agents/base-sepolia/879 |
| Agent #880 (8004scan) | https://testnet.8004scan.io/agents/base-sepolia/880 |

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
