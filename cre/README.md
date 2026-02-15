# CRE Workflow (To Be Wired)

This folder will contain the Chainlink CRE workflow that:
1) Calls a real KYB/KYC / business verification API (external system)
2) Calls a real LLM endpoint (risk JSON)
3) Writes the decision onchain to `ComplianceRegistry.setApproval(...)`

## What I need from you to implement this correctly (no mocks)

### A) CRE environment
- Output of `cre --version`
- Which trigger do you want for the demo:
  - HTTP trigger (easiest for video) OR
  - onchain event trigger (issuer emits `ListingSubmitted(...)`)
- The CRE “operator” address that will sign onchain writes (this must be set as `workflowOperator` in `ComplianceRegistry`)

### B) Chain / RPC
- Target chain: `Sepolia` or `Base Sepolia`
- RPC URL for that chain

### C) KYB/KYC (real)
Pick one real external source and share the integration details:
- Provider name (e.g., Sumsub / Persona / Onfido / OpenCorporates / etc.)
- Endpoint URL
- Auth method (API key header, OAuth, etc.)
- Minimal request payload we can send **without PII** (hashes only)
- Example response JSON (redacted)

### D) LLM (real)
- Provider: `OpenAI` or `Gemini`
- API key
- Model name
- Required JSON schema for output:
  - `approved: boolean`
  - `riskScore: number` (0–1000)
  - `reasons: string[]`

## Expected input payload (from trigger)
See `cre/example-request.json`.

