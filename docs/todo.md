# TODO (tracked)

This is the tracked to-do list for hackathon readiness (what still needs doing beyond local notes).

## Demo-critical
- [x] Run Anvil Base Sepolia fork e2e from `docs/anvil-base-sepolia-e2e.md` (reject-path completed).
- [ ] Run approve-path e2e by forcing Sumsub sandbox `reviewAnswer=GREEN` and rerunning workflow.
- [ ] Deploy contracts on Base Sepolia and record addresses (portal, receiver, registry, vault, ERC-8004 registries).
- [ ] Update `cre/chainlink-Convergence/my-workflow/config.staging.json` with Base Sepolia addresses.
- Set CRE secrets:
  - `GEMINI_API_KEY`
  - `CRE_ETH_PRIVATE_KEY`
  - If org is not linked for `cre secrets`, use `tools/sync-local-secrets-to-config.mjs` for local simulation fallback.
- Run end-to-end demo and capture:
  - diligence request submission tx + requestId
  - CRE `workflow simulate` output + `writeReport` tx hash
  - `ComplianceRegistry.isApproved(subject)` changes from false → true
  - vault `deposit` revert before approval and success after approval
 - (Optional) EAS automation demo:
   - deploy receiver with `EAS_ATTESTATION_CONTRACT` + `EAS_SCHEMA_UID`
   - capture `EASAttested(subject, uid)` event from the `RWAComplianceReceiver` tx

## Payments (x402)
- Enable x402 on the KYB provider (`services/kyb-provider/.env`: `X402_ENABLED=true`) and verify `POST /kyb` returns 402 until paid.
- Enable workflow-side buyer retry (`x402Enabled=true` in CRE config + `X402_BUYER_PRIVATE_KEY` secret).
 - Record a paid-call proof:
  - 402 response includes `accepts[]`
  - client retries with `X-PAYMENT`
  - server returns `X-PAYMENT-RESPONSE`

## Privacy (Confidential HTTP)
- Switch the workflow to use Confidential HTTP (`useConfidentialHttp=true`) once your CRE environment supports it for the target.
- Confirm the workflow still produces the same result while keeping KYB payloads off the public runner.

## Agents (ERC-8004)
- Decide the “diligence agent” identity:
  - register agent via `script/AgentRegister.s.sol`
  - store `agentId` + metadata (URI) used in the demo
- Record at least one:
  - reputation feedback via `script/GiveFeedback.s.sol`, and/or
  - validation request/response via `script/RequestValidation.s.sol` + `script/RespondValidation.s.sol`

## Hardening / polish (optional)
- Pin `RWAComplianceReceiver` expected workflow identity fields once the workflow is deployed.
- Add a simple frontend (issuer submit + status page) if time permits.
