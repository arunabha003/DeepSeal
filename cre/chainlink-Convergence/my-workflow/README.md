# Diligence Workflow (HTTP Trigger → Sumsub KYB + Gemini → onchain writeReport)

This workflow processes an onchain diligence request stored in `DiligencePortal` by:
1) reading the request data onchain (`getRequest(requestId)`)
2) resolving + verifying the metadata document bundle (`metadataUri` + `docBundleHash`) via `/docs/resolve`
3) deterministically extracting normalized `companyInfo` from the document bundle
4) calling a KYB verification endpoint (Sumsub sandbox via local provider)
5) calling Gemini for a strict JSON risk decision
6) writing the decision onchain via `EVMClient.writeReport` to `RWAComplianceReceiver`

`RWAComplianceReceiver` then updates `ComplianceRegistry`, syncs `RWAAssetRegistry`, can auto-create a per-request vault via `RWAVaultFactory`, and (if configured onchain) performs EAS + ERC-8004 side effects.

## 1) Configure RPCs
`../project.yaml` contains RPCs used by local simulation. Default is a public Sepolia RPC.

## 2) Configure secrets
Use the env file at `cre/chainlink-Convergence/.env` (not the repository root `.env`).

```bash
cd /Users/arunabha003/Documents/Projects/Chainlink-Converegence
cp cre/chainlink-Convergence/.env.example cre/chainlink-Convergence/.env
```

Set in `cre/chainlink-Convergence/.env`:
- `CRE_ETH_PRIVATE_KEY` (funded on target chain if you broadcast)
- `GEMINI_API_KEY`
- `X402_BUYER_PRIVATE_KEY` (required when `x402Enabled=true`)

Other env files are separate:
- `services/kyb-provider/.env` → Sumsub + x402 seller/provider settings
- `app/.env.local` → frontend/server env

## 3) Configure workflow
Copy examples to local config files first:
```bash
cp config.anvil-e2e.example.json config.anvil-e2e.json
cp config.staging.example.json config.staging.json
cp config.production.example.json config.production.json
```

Then pick one local config file:
- `config.anvil-e2e.json` → Anvil/fork e2e, free KYB path (`/kyb/free`), `x402Enabled=false`
- `config.staging.json` / `config.production.json` → Base Sepolia paid KYB path (`/kyb`), `x402Enabled=true`

Then edit the selected file:
- `environment` (`local` | `staging` | `production`)
- `diligencePortalAddress` (deployed `DiligencePortal`)
- `receiverAddress` (deployed `RWAComplianceReceiver`)
- `kybUrl` (local provider route)
- `documentResolverUrl` (local resolver route, usually `http://127.0.0.1:3001/docs/resolve`)
- `piiRedactorUrl` (PII redaction endpoint, usually `http://127.0.0.1:3001/pii/redact`)
- `auditWebhookUrl` (private audit sink/webhook, usually `http://127.0.0.1:3001/audit/webhook`)
- Optional:
  - `useConfidentialHttp` (explicit Confidential HTTP client)
  - `enforceSensitiveConfidential` (default true outside local mode; blocks non-confidential sensitive paths)
  - `x402Enabled` (should match whether KYB is paywalled on `POST /kyb`)
  - `auditWebhookEnabled` / `auditWebhookRequired`
  - `geminiApiKey` / `x402BuyerPrivateKey` (local simulation fallback when CRE secrets are not linked)
  - `docResolverApiKey`, `piiRedactorApiKey`, `auditWebhookApiKey` (optional shared keys for provider endpoints)

The real config files are gitignored and intended to be per-user/per-environment.

## x402 + Confidential HTTP
- x402 buyer retries are implemented for both HTTP client paths.
- When `useConfidentialHttp=true`, the workflow runs **all sensitive offchain calls** via `ConfidentialHTTPClient`:
  - document resolver (`/docs/resolve`)
  - KYB provider (`/kyb`)
  - Gemini risk scoring (`generativelanguage.googleapis.com`)
- PII redaction runs through Confidential HTTP (`/pii/redact`) before Gemini prompt construction.
- Audit delivery runs through Confidential HTTP (`/audit/webhook`) with enriched workflow outcome payload.
- For paid mode, set:
  - workflow `kybUrl` to `/kyb`
  - `x402Enabled=true`
  - `X402_BUYER_PRIVATE_KEY` in CRE secret manager or config fallback
  - Local fallback helper:
    - `node ../../tools/sync-local-secrets-to-config.mjs --config ./config.anvil-e2e.json`
    - `node ../../tools/sync-local-secrets-to-config.mjs --config ./config.staging.json`

If you use local fallback, reset config files before commit:
```bash
git restore --worktree cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json
git restore --worktree cre/chainlink-Convergence/my-workflow/config.staging.json
```

`Workflow Simulation Result` now includes:
- `providerStatus`
- `providerScore`
- `x402TxHash` (decoded from `X-PAYMENT-RESPONSE` when present)

## 4) Run KYB provider (local)
In repo root:
```bash
cd services/kyb-provider
npm install
npm run dev
```

## 5) Simulate
From `cre/chainlink-Convergence`:
```bash
PAYLOAD=$(jq -c . ../http-payload.json)
cre workflow simulate ./my-workflow --target anvil-e2e-settings --trigger-index 0 --http-payload "$PAYLOAD"
```

Example `../http-payload.json`:
```json
{ "requestId": 1 }
```
