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
- ERC-8004 workflow-side automation:
  - `src/RWAComplianceReceiver.sol` writes reputation feedback + validation request/response per processed report
  - `script/Deploy.s.sol` auto-registers two agent IDs (reputation + validation), configures receiver, and approves receiver for validation agent
- x402-ready KYB provider (seller/paywall) with free route for CRE simulation:
  - `services/kyb-provider/src/server.mjs`
- x402 buyer retries for both HTTP and Confidential HTTP workflow paths:
  - `cre/chainlink-Convergence/my-workflow/main.ts`
- Sumsub (Sandbox) KYB integration (real provider API):
  - `docs/sumsub-setup.md`
- Automated EAS attestations (optional) on each report:
  - `src/RWAComplianceReceiver.sol` (configurable via `setEAS(...)`, wired in `script/Deploy.s.sol`)
- CRE project scaffold + workflow:
  - `cre/chainlink-Convergence/my-workflow/main.ts` (HTTP trigger)
  - `cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json` (fork e2e profile)
  - `cre/abi/*.json` (ABIs exported for integration)
- Preflight helper:
  - `tools/readiness-check.mjs` validates CRE config addresses + deployed code + KYB provider health before simulate.
- Config sync helper:
  - `tools/sync-cre-config.mjs` updates CRE config addresses from Foundry deploy broadcast.
- Local secret fallback helper (for orgs without CRE `link-key` access):
  - `tools/sync-local-secrets-to-config.mjs` copies `.env` keys into `config.anvil-e2e.json`.
- Gemini model fallback in workflow:
  - If configured model is unavailable, workflow lists models and retries with an available `generateContent` model.

## What’s left
- Deploy contracts to Sepolia and fill:
  - `cre/chainlink-Convergence/my-workflow/config.staging.json`
- Run and record the full demo:
  - submit request → simulate workflow → registry updated → vault deposit succeeds
- Run and record paid x402 proof (402 challenge -> buyer retry with `X-PAYMENT` -> 200 success).
- Optional hardening: enforce workflow identity pinning + forwarder in production deployment.

## Known issues / fixes
- If `cre workflow simulate` fails while creating the engine, ensure:
  - `cre version` is current (`cre update`)
  - Your `project.yaml` RPC is reachable
  - If using EVM log triggers, use a WebSocket RPC; this workflow uses HTTP trigger to avoid subscriptions for now.
- `cre secrets` may fail with `owner not linked` for organizations not enabled for workflow deployment access.
  - Mitigation for local demos: use config fallbacks (`geminiApiKey`, `x402BuyerPrivateKey`) in `config.anvil-e2e.json`.
- In local simulation, `writeReport` may not expose a real tx hash (simulator can return empty/zero hash).
  - Validate success by reading `ComplianceRegistry.getRecord(subject)` after simulation.
- On Anvil Base Sepolia forks, buyer/deployer addresses can carry EIP-7702 delegation code (`0xef01...`).
  - This breaks USDC `transferWithAuthorization` / `permit` checks with `invalid signature`.
  - Mitigation: clear code with `anvil_setCode(<address>, "0x")` before paid x402 runs (see `docs/anvil-base-sepolia-e2e.md`).
- Validation side effect requires receiver authorization on the configured validation agent ID.
  - Default deploy script handles this via `identityRegistry.approve(address(receiver), validationAgentId)`.
