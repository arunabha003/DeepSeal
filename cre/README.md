# CRE Workflow (To Be Wired)

This folder will contain the Chainlink CRE workflow that:
1) Calls a KYB/KYC / business verification step (mock for now; replace later with real provider)
2) Calls Gemini for a strict JSON risk decision
3) Writes the decision onchain to `RWAComplianceReceiver.onReport(metadata, report)` which updates `ComplianceRegistry`

## Important: local limitation
In this Codex sandbox, DNS/network calls to `api.cre.chain.link` are blocked, so I cannot run `cre init` or simulate here.
You can run the CRE CLI on your machine, then I’ll wire/commit the generated workflow files in this repo.

## Setup (run locally)

### A) Initialize project (TypeScript)
Follow the official quickstart flow:
- `cre init`
  - Project name: `my-project`
  - Language: TypeScript
  - Template: “Custom Data Feed”
  - Workflow name: `my-workflow`
  - RPC URL: press Enter for default Sepolia (or paste your own)

Then:
- `cd my-project`
- `cre workflow simulate my-workflow`

### B) Secrets
Add these as CRE secrets (do not commit them anywhere):
- `GEMINI_API_KEY`

### C) Contracts the workflow writes to
The workflow should write to the deployed `RWAComplianceReceiver`:
- Function: `onReport(bytes metadata, bytes report)`
- `report` ABI encoding: `(address subject, bool approved, uint32 riskScore, bytes32 attestationHash)`
- `metadata`:
  - Can be `0x` for simulation while `RWAComplianceReceiver.forwarder == 0` and workflow identity checks are disabled
  - Later: set receiver `forwarder` + expected workflow identity to lock it down

### D) Trigger options
Pick one (both are compatible with the onchain design):
- **HTTP trigger**: easiest to demo; POST `{ subject, docBundleHash, metadataUri }`
- **EVM log trigger**: listen to `DiligencePortal.DiligenceRequested(...)` and process requests as they come in

## Expected input payload (from trigger)
See `cre/example-request.json`.
