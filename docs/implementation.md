# Implementation (tracked)

This doc is the tracked counterpart to local notes. It summarizes what exists in the repo and what remains for hackathon readiness.

## Implemented
- ERC-4626 vault gating by onchain compliance registry:
  - `src/ComplianceRegistry.sol`
  - `src/RWAVault.sol`
- Due diligence request portal:
  - `src/DiligencePortal.sol`
  - `script/SubmitRequest.s.sol`
- CRE report receiver + workflow identity hardening:
  - `src/RWAComplianceReceiver.sol`
- EAS helper scripts (optional audit trail):
  - `script/EASRegisterSchema.s.sol`
  - `script/EASAttest.s.sol`
- ERC-8004 agent primitives (identity + reputation + validation):
  - `src/erc8004/IdentityRegistry.sol`
  - `src/erc8004/ReputationRegistry.sol`
  - `src/erc8004/ValidationRegistry.sol`
  - helper scripts in `script/*Validation*.s.sol`, `script/AgentRegister.s.sol`, `script/GiveFeedback.s.sol`
- x402-ready KYB provider (seller/paywall) with free route for CRE simulation:
  - `services/kyb-provider/src/server.mjs`
- Sumsub (Sandbox) KYB integration (real provider API):
  - `docs/sumsub-setup.md`
- Automated EAS attestations (optional) on each report:
  - `src/RWAComplianceReceiver.sol` (configurable via `setEAS(...)`, wired in `script/Deploy.s.sol`)
- CRE project scaffold + workflow:
  - `cre/chainlink-Convergence/my-workflow/main.ts` (HTTP trigger)
  - `cre/abi/*.json` (ABIs exported for integration)
- Preflight helper:
  - `tools/readiness-check.mjs` validates CRE config addresses + deployed code + KYB provider health before simulate.

## What’s left
- Deploy contracts to Sepolia and fill:
  - `cre/chainlink-Convergence/my-workflow/config.staging.json`
- Run and record the full demo:
  - submit request → simulate workflow → registry updated → vault deposit succeeds
- Optional: enable x402 on the KYB provider and add a paid-call demo (buyer wallet + USDC) or enable `x402Enabled=true` in the CRE workflow config.
- Optional hardening: enforce workflow identity pinning + forwarder in production deployment.

## Known issues / fixes
- If `cre workflow simulate` fails while creating the engine, ensure:
  - `cre version` is current (`cre update`)
  - Your `project.yaml` RPC is reachable
  - If using EVM log triggers, use a WebSocket RPC; this workflow uses HTTP trigger to avoid subscriptions for now.
