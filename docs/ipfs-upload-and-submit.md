# Upload a Real Company Bundle to IPFS and Submit Onchain

Use this for the production flow (no payload fallback).

## 1) Prepare the bundle file

Start from:

- `docs/acme-company-bundle.upload.json`

Edit it with your real company details and real document hashes.

## 2) Upload to IPFS

Use any pinning provider. Example with Pinata Web UI:

1. Open Pinata and sign in.
2. Upload `docs/acme-company-bundle.upload.json`.
3. Copy the returned CID (example: `bafy...`).
4. Build metadata URI:

```bash
export METADATA_URI="ipfs://<CID>/acme-company-bundle.upload.json"
```

## 3) Compute `docBundleHash`

From repo root:

```bash
node tools/hash-doc-bundle.mjs --uri "$METADATA_URI"
```

Take the output `docBundleHash`:

```bash
export DOC_BUNDLE_HASH="<0x...from-tool-output>"
```

## 4) Submit request onchain

```bash
export RPC_URL=<your_rpc_url>
export PRIVATE_KEY=<issuer_private_key>
export PORTAL_ADDRESS=<deployed_diligence_portal_address>
export SUBJECT=<wallet_or_entity_address_being_screened>

forge script script/SubmitRequest.s.sol:SubmitRequest --rpc-url "$RPC_URL" --broadcast
```

## 5) Run CRE workflow

The trigger payload should be request-id only:

```json
{ "requestId": 1 }
```

Then run:

```bash
cd cre/chainlink-Convergence
PAYLOAD='{"requestId":1}'
cre workflow simulate ./my-workflow --target staging-settings --trigger-index 0 --http-payload "$PAYLOAD" --non-interactive -e .env
```

## 6) What is persisted onchain

- In `DiligencePortal` request:
  - `subject`
  - `docBundleHash`
  - `metadataUri`
- In `ComplianceRegistry` record:
  - `approved`
  - `riskScore`
  - `attestationHash`
  - `updatedAt`

Full document contents remain offchain (IPFS).
