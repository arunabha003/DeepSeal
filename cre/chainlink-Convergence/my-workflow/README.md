# Diligence Workflow (HTTP Trigger → KYB stub + Gemini → onchain writeReport)

This workflow processes an onchain diligence request stored in `DiligencePortal` by:
1) reading the request data onchain (`getRequest(requestId)`)
2) calling a KYB verification endpoint (mock for now; local stub)
3) calling Gemini for a strict JSON risk decision
4) writing the decision onchain via `EVMClient.writeReport` to `RWAComplianceReceiver`

## 1) Configure RPCs
`../project.yaml` contains RPCs used by local simulation. Default is a public Sepolia RPC.

## 2) Configure secrets
Create `../.env` from `../.env.example` and set:
- `CRE_ETH_PRIVATE_KEY` (funded on Sepolia if you broadcast)
- `GEMINI_API_KEY`

## 3) Configure workflow
Edit `config.staging.json`:
- `diligencePortalAddress` (deployed `DiligencePortal`)
- `receiverAddress` (deployed `RWAComplianceReceiver`)
- `kybUrl` (local provider free route: `http://127.0.0.1:3001/kyb/free`)

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
cre workflow simulate ./my-workflow --trigger-index 0 --http-payload ../http-payload.json
```

Example `../http-payload.json`:
```json
{ "requestId": 1 }
```
