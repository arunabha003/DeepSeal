# Confidential RWA Due‑Diligence Vault

ERC‑4626 vault gated by an onchain compliance registry, intended to be driven by a Chainlink CRE workflow that performs KYB/KYC checks + LLM risk analysis and then writes approvals onchain.

## What’s in this repo (so far)
- `src/ComplianceRegistry.sol`: stores per-address approvals + riskScore + attestationHash; updates allowed by `owner` or `workflowOperator`.
- `src/RWAVault.sol`: ERC‑4626 vault that blocks `deposit/mint` unless **both** caller and receiver are approved in `ComplianceRegistry`.
- `src/DemoUSD.sol`: demo underlying ERC‑20 (6 decimals) for local/testnet demos.
- `script/Deploy.s.sol`: deploys `DemoUSD`, `ComplianceRegistry`, `RWAVault`.
- `script/Configure.s.sol`: manually sets approval on the registry (useful until CRE workflow is wired).

## Build & test
```bash
forge build
forge test
```

## Local deploy (anvil)
Terminal 1:
```bash
anvil
```

Terminal 2:
```bash
export PRIVATE_KEY=0xYOUR_ANVIL_KEY
export WORKFLOW_OPERATOR=0xCRE_SIGNER_ADDRESS   # optional; defaults to deployer
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

## Manual approve (until CRE is wired)
```bash
export PRIVATE_KEY=0xYOUR_KEY
export REGISTRY_ADDRESS=0x...
export SUBJECT=0x...
export APPROVED=true
export RISK_SCORE=42
export ATTESTATION_HASH=0x0000000000000000000000000000000000000000000000000000000000000000
forge script script/Configure.s.sol:Configure --rpc-url http://127.0.0.1:8545 --broadcast
```
