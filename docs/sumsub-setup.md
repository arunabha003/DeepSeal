# Sumsub (Sandbox) setup

This repo integrates Sumsub as the “real” KYB/KYC provider (running in Sumsub’s Sandbox environment).

## What you need from Sumsub
- `SUMSUB_APP_TOKEN`
- `SUMSUB_SECRET_KEY`
- `SUMSUB_LEVEL_NAME` (business verification level name)

Add them to `services/kyb-provider/.env` (gitignored). Template: `services/kyb-provider/.env.example`.

Quick auth check after starting provider:
```bash
curl -s http://127.0.0.1:3001/sumsub/healthz | jq
```
Expect:
- `authValid: true` when token/signature are accepted.
- `authValid: false` with `401/403` when token/secret/signature mismatch.

## How the integration works
- The KYB provider service (`services/kyb-provider`) calls Sumsub API using the signed header scheme.
- It uses `externalUserId = <subject wallet address>` to look up the applicant:
  - `GET /resources/applicants/-;externalUserId=<subject>/one`
- If no applicant exists and the request includes `companyInfo`, it creates one:
  - `POST /resources/applicants?levelName=<SUMSUB_LEVEL_NAME>`
- It requests a check and then reads the current review status:
  - `POST /resources/applicants/<applicantId>/status/pending`
  - `GET /resources/applicants/<applicantId>/status`
  - `GET /resources/applicants/<applicantId>/requiredIdDocsStatus`

The service maps Sumsub status to:
- `providerStatus = APPROVED` when `reviewStatus=completed` and `reviewAnswer=GREEN`
- otherwise `providerStatus = REJECTED` (pending cases return mid score)

## Sandbox helper endpoint (optional)
For demos, the KYB provider exposes a sandbox-only helper:
- `POST /sumsub/sandbox/testCompleted` with `{ "applicantId": "...", "reviewAnswer": "GREEN" }`

This calls Sumsub’s sandbox “testCompleted” API for that applicant.

## CRE workflow input (optional)
The CRE HTTP trigger supports an optional `companyInfo` object (passed through to the KYB provider for applicant creation):

```json
{
  "requestId": 1,
  "companyInfo": {
    "companyName": "Acme LLC",
    "country": "USA",
    "registrationNumber": "1234567",
    "website": "https://example.com"
  }
}
```

## Business verification input notes
For business KYB, provide at least:
- `companyName`
- `country` (ISO-3 country code, e.g. `USA`)

Optional fields you can add as available:
- `registrationNumber`
- `incorporatedOn`
- `website`

If the applicant already exists in Sumsub for the wallet subject (`externalUserId`), `companyInfo` is not required.
