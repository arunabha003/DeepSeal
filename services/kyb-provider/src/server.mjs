import dotenv from 'dotenv'
import crypto from 'node:crypto'
import express from 'express'
import { createPublicClient, createWalletClient, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { avalanche, avalancheFuji, base, baseSepolia, polygon, polygonAmoy } from 'viem/chains'

dotenv.config({ path: new URL('../.env', import.meta.url) })

import { decodePayment } from 'x402/schemes'
import { getDefaultAsset, processPriceToAtomicAmount } from 'x402/shared'
import { settleResponseHeader } from 'x402/types'
import { settle, verify } from 'x402/facilitator'

const app = express()
app.use(express.json({ limit: '2mb' }))

const port = Number(process.env.PORT || 3001)
const x402Enabled = String(process.env.X402_ENABLED || 'false').toLowerCase() === 'true'
const x402Version = Number(process.env.X402_VERSION || 1)

const chainByX402Network = {
  'base-sepolia': baseSepolia,
  base,
  'avalanche-fuji': avalancheFuji,
  avalanche,
  'polygon-amoy': polygonAmoy,
  polygon,
}

const mustEnv = (name) => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

const parseHexPrivateKey = (raw, envName) => {
  const value = String(raw || '').trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${envName} must be a 32-byte hex private key (0x + 64 hex chars)`)
  }
  return value
}

const getX402RelayerPrivateKey = () => {
  const pk = process.env.X402_RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY
  return parseHexPrivateKey(pk, process.env.X402_RELAYER_PRIVATE_KEY ? 'X402_RELAYER_PRIVATE_KEY' : 'PRIVATE_KEY')
}

const getX402RpcUrl = (network) => {
  if (process.env.X402_RPC_URL) return process.env.X402_RPC_URL
  if (process.env.RPC_URL) return process.env.RPC_URL
  const chain = chainByX402Network[network]
  if (!chain) throw new Error(`Unsupported X402 network: ${network}`)
  return chain.rpcUrls.default.http[0]
}

const getX402Clients = (network) => {
  const chain = chainByX402Network[network]
  if (!chain) throw new Error(`Unsupported X402 network: ${network}`)
  const rpcUrl = getX402RpcUrl(network)
  const relayerAccount = privateKeyToAccount(getX402RelayerPrivateKey())
  const transport = http(rpcUrl)
  const verifyClient = createPublicClient({ chain, transport })
  const settleClient = createWalletClient({ chain, transport, account: relayerAccount })
  return { verifyClient, settleClient, relayer: relayerAccount.address, rpcUrl }
}

const sumsubEnabled =
  Boolean(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY) ||
  Boolean(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET)

const sumsubBaseUrl = String(process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com').replace(/\/+$/, '')
const sumsubToken = process.env.SUMSUB_APP_TOKEN
const sumsubSecret = process.env.SUMSUB_SECRET_KEY || process.env.SUMSUB_SECRET
const sumsubLevelName = process.env.SUMSUB_LEVEL_NAME

const hmacSha256Hex = (secretKey, msg) =>
  crypto.createHmac('sha256', secretKey).update(msg, 'utf8').digest('hex')

const sha256Hex = (msg) => crypto.createHash('sha256').update(msg, 'utf8').digest('hex')

const sumsubRequest = async ({ method, path, body }) => {
  if (!sumsubEnabled) {
    throw new Error(
      'Sumsub not configured. Set SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY in services/kyb-provider/.env.',
    )
  }

  const url = new URL(sumsubBaseUrl + path)
  const ts = Math.floor(Date.now() / 1000).toString()
  const bodyStr = body ? JSON.stringify(body) : ''
  const sig = hmacSha256Hex(sumsubSecret, ts + method.toUpperCase() + url.pathname + url.search + bodyStr)

  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'X-App-Token': sumsubToken,
      'X-App-Access-Sig': sig,
      'X-App-Access-Ts': ts,
    },
    body: body ? bodyStr : undefined,
  })

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  return { ok: res.ok, status: res.status, json, text }
}

const getOrCreateApplicantId = async ({ externalUserId, applicant }) => {
  const lookupPath = `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`
  const lookup = await sumsubRequest({ method: 'GET', path: lookupPath })

  if (lookup.ok && lookup.json?.id) return lookup.json.id

  if (!applicant) {
    throw new Error(
      `No Sumsub applicant found for externalUserId=${externalUserId}. Provide applicant info or create applicant in Sumsub dashboard.`,
    )
  }

  if (!sumsubLevelName) {
    throw new Error('Missing SUMSUB_LEVEL_NAME in services/kyb-provider/.env (the verification level to use).')
  }

  const createPath = `/resources/applicants?levelName=${encodeURIComponent(sumsubLevelName)}`
  const createBody = {
    externalUserId,
    ...applicant,
  }

  const created = await sumsubRequest({ method: 'POST', path: createPath, body: createBody })
  if (!created.ok || !created.json?.id) {
    throw new Error(`Failed to create applicant: status=${created.status} body=${created.text}`)
  }
  return created.json.id
}

const requestApplicantCheck = async ({ applicantId, reason }) => {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/status/pending?reason=${encodeURIComponent(
    reason || 'kyb',
  )}`
  const r = await sumsubRequest({ method: 'POST', path, body: {} })
  // If it fails, it might already be pending/complete. Don't hard-fail the KYB response.
  return r
}

const getApplicantStatus = async ({ applicantId }) => {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/status`
  const r = await sumsubRequest({ method: 'GET', path })
  if (!r.ok) throw new Error(`Failed to get applicant status: status=${r.status} body=${r.text}`)
  return r.json
}

const getRequiredIdDocsStatus = async ({ applicantId }) => {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/requiredIdDocsStatus`
  const r = await sumsubRequest({ method: 'GET', path })
  if (!r.ok) throw new Error(`Failed to get requiredIdDocsStatus: status=${r.status} body=${r.text}`)
  return r.json
}

const toPaymentRequirements = (req) => {
  const payTo = mustEnv('X402_PAY_TO')
  if (!isAddress(payTo)) {
    const looksLikePrivateKey = /^0x[0-9a-fA-F]{64}$/.test(payTo)
    throw new Error(
      looksLikePrivateKey
        ? 'X402_PAY_TO is a private key, but it must be a recipient wallet address (0x + 40 hex chars).'
        : 'X402_PAY_TO must be a valid recipient wallet address (0x + 40 hex chars).',
    )
  }
  const network = String(process.env.X402_NETWORK || 'base-sepolia')
  const price = process.env.KYB_PRICE || '0.01'
  const timeout = Number(process.env.X402_TIMEOUT_SECONDS || 120)

  const origin = `${req.protocol}://${req.get('host')}`
  const resource = `${origin}/kyb`

  const { maxAmountRequired, asset, error } = processPriceToAtomicAmount(price, network)
  if (error) throw new Error(error)

  const defaultAsset = getDefaultAsset(network)

  return [
    {
      scheme: 'exact',
      network,
      maxAmountRequired,
      resource,
      description: 'KYB verification (Sumsub sandbox) with x402 payment rail',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: timeout,
      asset: asset?.address || defaultAsset.address,
      extra: asset?.eip712 || defaultAsset.eip712,
    },
  ]
}

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, x402Enabled }))

app.get('/sumsub/healthz', async (_req, res) => {
  if (!sumsubEnabled) {
    return res.status(500).json({
      configured: false,
      authValid: false,
      error: 'Sumsub env vars missing (SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY).',
    })
  }

  try {
    // Probe auth by querying a guaranteed-nonexistent externalUserId.
    // 404 means auth/signing works and resource is absent; 401/403 means auth failure.
    const probeExternalUserId = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const path = `/resources/applicants/-;externalUserId=${encodeURIComponent(probeExternalUserId)}/one`
    const r = await sumsubRequest({ method: 'GET', path })

    const authValid = r.status !== 401 && r.status !== 403
    return res.status(authValid ? 200 : 502).json({
      configured: true,
      authValid,
      status: r.status,
      message: authValid
        ? 'Auth signature accepted by Sumsub.'
        : 'Sumsub rejected auth/signature. Check app token/secret/signing inputs.',
      response: r.json || r.text || null,
    })
  } catch (e) {
    return res.status(502).json({
      configured: true,
      authValid: false,
      error: String(e?.message || e),
    })
  }
})

const sumsubVerify = async (payload) => {
  const subject = payload?.subject
  if (!subject || typeof subject !== 'string') throw new Error('Missing subject (wallet address) in request body')

  const applicant =
    payload?.companyInfo && typeof payload.companyInfo === 'object'
      ? {
          type: 'company',
          fixedInfo: { companyInfo: payload.companyInfo },
        }
      : null

  const applicantId = await getOrCreateApplicantId({ externalUserId: subject.toLowerCase(), applicant })
  await requestApplicantCheck({ applicantId, reason: 'kyb' })

  const status = await getApplicantStatus({ applicantId })
  const docs = await getRequiredIdDocsStatus({ applicantId })

  const reviewStatus = String(status?.reviewStatus || '')
  const reviewAnswer = String(status?.reviewResult?.reviewAnswer || '')

  const approved = reviewStatus === 'completed' && reviewAnswer === 'GREEN'
  const pending = reviewStatus !== 'completed' && reviewAnswer !== 'RED'

  const providerStatus = approved ? 'APPROVED' : 'REJECTED'
  const providerScore = approved ? 10 : pending ? 500 : 900

  const responseHash = sha256Hex(
    JSON.stringify({
      applicantId,
      reviewStatus,
      reviewAnswer,
      docs,
    }),
  )

  return {
    providerStatus,
    providerScore,
    providerResponseHash: `0x${responseHash.padEnd(64, '0').slice(0, 64)}`,
    sumsub: { applicantId, reviewStatus, reviewAnswer },
  }
}

// Free path for CRE workflow simulation until x402 buyer support is wired in.
app.post('/kyb/free', async (req, res) => {
  try {
    const out = await sumsubVerify(req.body)
    res.status(200).json(out)
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) })
  }
})

// Paywalled path when X402_ENABLED=true.
app.post('/kyb', async (req, res) => {
  if (!x402Enabled) {
    try {
      const out = await sumsubVerify(req.body)
      return res.status(200).json(out)
    } catch (e) {
      return res.status(400).json({ error: String(e?.message || e) })
    }
  }

  const accepts = toPaymentRequirements(req)
  const paymentHeader = req.header('X-PAYMENT')

  if (!paymentHeader) {
    return res.status(402).json({ x402Version, accepts })
  }

  try {
    const payload = decodePayment(paymentHeader)
    const paymentRequirements = accepts[0]

    const { verifyClient, settleClient } = getX402Clients(paymentRequirements.network)

    const verifyResp = await verify(verifyClient, payload, paymentRequirements)
    if (!verifyResp?.isValid) {
      return res.status(402).json({
        x402Version,
        accepts,
        error: verifyResp?.invalidReason || 'unexpected_verify_error',
        payer: verifyResp?.payer,
      })
    }

    const settleResp = await settle(settleClient, payload, paymentRequirements)
    if (!settleResp?.success) {
      return res.status(402).json({
        x402Version,
        accepts,
        error: settleResp?.errorReason || 'unexpected_settle_error',
        payer: settleResp?.payer,
      })
    }

    res.setHeader('X-PAYMENT-RESPONSE', settleResponseHeader(settleResp))
    const out = await sumsubVerify(req.body)
    return res.status(200).json(out)
  } catch (e) {
    return res.status(402).json({
      x402Version,
      accepts,
      error: 'unexpected_verify_error',
      detail: String(e?.message || e),
    })
  }
})

// Sandbox helper: force an applicant to complete with a given reviewAnswer (GREEN/RED).
// This uses Sumsub's sandbox-only endpoint described in their docs.
app.post('/sumsub/sandbox/testCompleted', async (req, res) => {
  try {
    const applicantId = req.body?.applicantId
    const reviewAnswer = req.body?.reviewAnswer || 'GREEN'
    if (!applicantId) return res.status(400).json({ error: 'Missing applicantId' })

    const path = `/resources/applicants/${encodeURIComponent(applicantId)}/status/testCompleted`
    const r = await sumsubRequest({ method: 'POST', path, body: { reviewAnswer } })
    return res.status(r.ok ? 200 : 400).json(r.json || { status: r.status, body: r.text })
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[kyb-provider] listening on http://localhost:${port} (x402Enabled=${x402Enabled})`)
})
