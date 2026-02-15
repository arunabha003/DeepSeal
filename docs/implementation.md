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
- CRE project scaffold + workflow:
  - `cre/chainlink-Convergence/my-workflow/main.ts` (HTTP trigger)
  - `cre/abi/*.json` (ABIs exported for integration)

## What’s left
- Deploy contracts to Sepolia and fill:
  - `cre/chainlink-Convergence/my-workflow/config.staging.json`
- Run and record the full demo:
  - submit request → simulate workflow → registry updated → vault deposit succeeds
- Replace KYB stub with a real provider (later)

## Known issues / fixes
- If `cre workflow simulate` fails while creating the engine, ensure:
  - `cre version` is current (`cre update`)
  - Your `project.yaml` RPC is reachable
  - If using EVM log triggers, use a WebSocket RPC; this workflow uses HTTP trigger to avoid subscriptions for now.

