# Implementation Status

This file tracks what’s implemented, what’s next, and any blockers/issues.

## Implemented
- Foundry scaffold (`foundry.toml`, `src/`, `script/`, `test/`)
- Local vendored dependencies (no network):
  - `lib/forge-std`
  - `lib/openzeppelin-contracts`
- Remappings (`remappings.txt`)
- Onchain contracts:
  - `src/ComplianceRegistry.sol`
  - `src/RWAVault.sol`
  - `src/DemoUSD.sol`
- Tests:
  - `test/ComplianceRegistry.t.sol`
  - `test/RWAVault.t.sol`
- Scripts:
  - `script/Deploy.s.sol`
  - `script/Configure.s.sol`

## In Progress
- CRE integration (workflow + real external checks)

## Next
- CRE workflow (`cre/workflow.ts`) + real KYB/KYC + real LLM endpoints (needs API keys + CRE setup)
- Root README for hackathon submission + demo script

## Issues / Notes
- Network access from this environment cannot resolve `github.com`, so `forge install ...` fails.
  - Workaround: dependencies are copied from existing local repos into `lib/`.
  - If you prefer fresh versions, you can run `forge install --no-git ...` on your machine and we’ll use those.
