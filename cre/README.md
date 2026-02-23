# CRE Workflow — DeepSeal

This folder contains the fully-implemented Chainlink CRE workflow that orchestrates the
end-to-end compliance pipeline:

1. **Reads** a diligence request from `DiligencePortal` on-chain (Base Sepolia)
2. **Resolves and verifies** the document bundle from `metadataUri` via secure resolver (`/docs/resolve`)
3. **Extracts deterministic fields** (`companyInfo`) and records extraction provenance hashes
4. **Calls KYB provider** (Sumsub sandbox) via x402 micropayment rail
5. **Calls Gemini AI** for structured risk scoring with model auto-retry
6. **Writes** the decision on-chain to `RWAComplianceReceiver.onReport()` → updates `ComplianceRegistry`, syncs the per-request RWA asset record, auto-creates a per-asset ERC-4626 vault, and triggers ERC-8004 side effects

## Key Files

| File | Description |
|------|-------------|
| `chainlink-Convergence/my-workflow/main.ts` | 866-line CRE workflow (TypeScript) — the core logic |
| `chainlink-Convergence/my-workflow/config.anvil-e2e.json` | Config for local Anvil fork simulation |
| `chainlink-Convergence/my-workflow/config.staging.json` | Config for staging (real Base Sepolia) |
| `chainlink-Convergence/project.yaml` | CRE project settings (RPC targets) |
| `chainlink-Convergence/secrets.yaml` | CRE secrets config |
| `abi/` | Exported ABIs for DiligencePortal, ComplianceRegistry, RWAComplianceReceiver |
| `example-request.json` | Example trigger payload |

## How to Simulate

```bash
# 1. Start Anvil (Base Sepolia fork)
anvil --fork-url https://sepolia.base.org --chain-id 84532 --host 127.0.0.1 --port 8545

# 2. Deploy contracts
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast

# 3. Submit a diligence request
forge script script/SubmitRequest.s.sol:SubmitRequest --rpc-url http://127.0.0.1:8545 --broadcast

# 4. Run CRE simulation
cd cre/chainlink-Convergence
PAYLOAD='{"requestId":1}'
cre workflow simulate ./my-workflow \
  --target anvil-e2e-settings \
  --trigger-index 0 \
  --http-payload "$PAYLOAD" \
  --non-interactive \
  -e .env
```

Or use the **frontend** — go to `http://localhost:3000/process`, enter a request ID, and click
**Run CRE Workflow**. The frontend streams every step live via SSE and writes the result on-chain
automatically.

## Secrets

Required secrets (set in `cre/chainlink-Convergence/.env` or CRE secrets manager):
- `GEMINI_API_KEY` — Google Gemini API key for risk analysis

Optional (for x402 paid KYB path):
- `X402_BUYER_PRIVATE_KEY` — Wallet key to pay KYB provider via x402
- `DOC_RESOLVER_API_KEY` — Shared key for `/docs/resolve` (if enabled on resolver service)

## Contracts the Workflow Writes To

- **Function**: `RWAComplianceReceiver.onReport(bytes metadata, bytes report)`
- **Report encoding**: `(uint256 requestId, address subject, bool approved, uint32 riskScore, bytes32 attestationHash)`
- **Effect**: Updates `ComplianceRegistry` + upserts `RWAAssetRegistry` + auto-creates per-asset vault via `RWAVaultFactory` + triggers ERC-8004 reputation/validation + optional EAS attestation

## Trigger Options

- **HTTP trigger** (default): POST `{ requestId }` — document fields are resolved from onchain `metadataUri`
- **EVM log trigger**: Listen to `DiligencePortal.DiligenceRequested(...)` for production use
