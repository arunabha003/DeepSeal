import dotenv from 'dotenv'
import crypto from 'node:crypto'
import express from 'express'
import { createPublicClient, createWalletClient, hashDomain, http, isAddress, keccak256, publicActions, toHex } from 'viem'
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
const x402Debug = String(process.env.X402_DEBUG || 'false').toLowerCase() === 'true'

const x402Log = (...args) => {
  if (x402Debug) console.log(...args)
}

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
  const client = createWalletClient({ chain, transport, account: relayerAccount }).extend(publicActions)
  return { verifyClient: client, settleClient: client, relayer: relayerAccount.address, rpcUrl }
}

const getX402PublicClient = (network) => {
  const chain = chainByX402Network[network]
  if (!chain) throw new Error(`Unsupported X402 network: ${network}`)
  return createPublicClient({ chain, transport: http(getX402RpcUrl(network)) })
}

const resolveAssetEip712 = async (network, assetAddress, fallback) => {
  const overrideName = String(process.env.X402_EIP712_NAME || '').trim()
  const overrideVersion = String(process.env.X402_EIP712_VERSION || '').trim()
  if (overrideName && overrideVersion) {
    return { name: overrideName, version: overrideVersion }
  }

  let onchainName = ''
  let onchainVersion = ''
  let onchainDomainSeparator = ''

  try {
    const client = getX402PublicClient(network)
    const abi = [
      { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
      { name: 'version', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
      { name: 'DOMAIN_SEPARATOR', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
    ]
    const [name, version, domainSeparator] = await Promise.all([
      client.readContract({ address: assetAddress, abi, functionName: 'name' }).catch(() => ''),
      client.readContract({ address: assetAddress, abi, functionName: 'version' }).catch(() => ''),
      client.readContract({ address: assetAddress, abi, functionName: 'DOMAIN_SEPARATOR' }).catch(() => ''),
    ])
    onchainName = typeof name === 'string' ? name : ''
    onchainVersion = typeof version === 'string' ? version : ''
    onchainDomainSeparator = typeof domainSeparator === 'string' ? domainSeparator.toLowerCase() : ''
  } catch {
    // Fallback to configured defaults below.
  }

  const chain = chainByX402Network[network]
  if (!chain) throw new Error(`Unsupported X402 network: ${network}`)

  const dedupe = new Set()
  const candidates = [
    onchainName && onchainVersion ? { name: onchainName, version: onchainVersion } : null,
    fallback || null,
    { name: 'USD Coin', version: '2' },
    { name: 'USDC', version: '2' },
    { name: 'USD Coin', version: '1' },
    { name: 'USDC', version: '1' },
  ]
    .filter(Boolean)
    .filter((candidate) => {
      const key = `${candidate.name}::${candidate.version}`
      if (dedupe.has(key)) return false
      dedupe.add(key)
      return true
    })

  if (/^0x[0-9a-fA-F]{64}$/.test(onchainDomainSeparator)) {
    const domainTypes = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
    }
    for (const candidate of candidates) {
      const separator = hashDomain({
        domain: {
          name: candidate.name,
          version: candidate.version,
          chainId: chain.id,
          verifyingContract: assetAddress,
        },
        types: domainTypes,
      }).toLowerCase()
      if (separator === onchainDomainSeparator) {
        return candidate
      }
    }
  }

  if (onchainName && onchainVersion) return { name: onchainName, version: onchainVersion }
  return fallback
}

const forceApprove = String(process.env.FORCE_APPROVE || 'false').toLowerCase() === 'true'

const sumsubEnabled =
  Boolean(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY) ||
  Boolean(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET)

const sumsubBaseUrl = String(process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com').replace(/\/+$/, '')
const sumsubToken = process.env.SUMSUB_APP_TOKEN
const sumsubSecret = process.env.SUMSUB_SECRET_KEY || process.env.SUMSUB_SECRET
const sumsubLevelName = process.env.SUMSUB_LEVEL_NAME
const docResolverApiKey = String(process.env.DOC_RESOLVER_API_KEY || '').trim()
const piiRedactorApiKey = String(process.env.PII_REDACTOR_API_KEY || '').trim()
const auditWebhookApiKey = String(process.env.AUDIT_WEBHOOK_API_KEY || '').trim()
const auditWebhookLogBody = String(process.env.AUDIT_WEBHOOK_LOG_BODY || 'false').toLowerCase() === 'true'
const docResolverIpfsGateway = String(process.env.DOC_RESOLVER_IPFS_GATEWAY || 'https://ipfs.io/ipfs').replace(/\/+$/, '')
const docResolverAllowInsecureHttp = String(process.env.DOC_RESOLVER_ALLOW_INSECURE_HTTP || 'false').toLowerCase() === 'true'
const docResolverTimeoutMs = Number(process.env.DOC_RESOLVER_TIMEOUT_MS || 15000)
const docResolverMaxBytes = Number(process.env.DOC_RESOLVER_MAX_BYTES || 2_000_000)
const docResolverAllowedHosts = String(process.env.DOC_RESOLVER_ALLOWED_HOSTS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

const hmacSha256Hex = (secretKey, msg) =>
  crypto.createHmac('sha256', secretKey).update(msg, 'utf8').digest('hex')

const sha256Hex = (msg) => crypto.createHash('sha256').update(msg, 'utf8').digest('hex')

const canonicalStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalStringify(entry)).join(',')}]`
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
  const body = entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(',')
  return `{${body}}`
}

const piiKeyHints = new Set([
  'email',
  'phone',
  'dob',
  'birthdate',
  'firstName',
  'lastName',
  'fullName',
  'address',
  'documentNumber',
  'passport',
  'passportNumber',
  'taxId',
  'tin',
  'ssn',
])

const redactStringValue = (input) => {
  if (typeof input !== 'string') return { value: input, redacted: false }
  let value = input
  let redacted = false
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const phonePattern = /(?:\+?\d[\d\s().-]{6,}\d)/g
  if (emailPattern.test(value)) {
    value = value.replace(emailPattern, '[REDACTED_EMAIL]')
    redacted = true
  }
  if (phonePattern.test(value)) {
    value = value.replace(phonePattern, '[REDACTED_PHONE]')
    redacted = true
  }
  return { value, redacted }
}

const redactPayload = (input, parentPath = '$') => {
  const redactedFields = []

  const walk = (value, path) => {
    if (Array.isArray(value)) {
      return value.map((entry, idx) => walk(entry, `${path}[${idx}]`))
    }

    if (value && typeof value === 'object') {
      const out = {}
      for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`
        if (piiKeyHints.has(key)) {
          redactedFields.push(childPath)
          out[key] = `[REDACTED_${key.toUpperCase()}]`
          continue
        }
        out[key] = walk(child, childPath)
      }
      return out
    }

    if (typeof value === 'string') {
      const { value: masked, redacted } = redactStringValue(value)
      if (redacted) redactedFields.push(path)
      return masked
    }

    return value
  }

  const redactedPayload = walk(input, parentPath)
  return { redactedPayload, redactedFields }
}

const normalizeCompanyInfo = (candidate) => {
  if (!candidate || typeof candidate !== 'object') return null
  const companyName = String(candidate.companyName || candidate.name || '').trim()
  const country = String(candidate.country || candidate.countryCode || '').trim()
  if (!companyName || !country) return null
  const registrationNumber = String(
    candidate.registrationNumber || candidate.regNumber || candidate.companyNumber || '',
  ).trim()
  const website = String(candidate.website || candidate.url || '').trim()
  return {
    companyName,
    country,
    ...(registrationNumber ? { registrationNumber } : {}),
    ...(website ? { website } : {}),
  }
}

const extractCompanyInfoFromDocument = (doc) => {
  const candidates = [
    doc?.companyInfo,
    doc?.fixedInfo?.companyInfo,
    doc?.company,
    doc?.issuer?.companyInfo,
    doc?.extracted?.companyInfo,
    doc?.fields,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeCompanyInfo(candidate)
    if (normalized) return normalized
  }

  throw new Error(
    'Could not extract company info from document bundle. Expected companyName and country in companyInfo/fixedInfo.companyInfo/company/issuer.companyInfo.',
  )
}

const resolveMetadataUriToHttpUrl = (metadataUri) => {
  if (typeof metadataUri !== 'string' || metadataUri.length === 0) {
    throw new Error('metadataUri is required')
  }
  if (metadataUri.startsWith('ipfs://')) {
    const suffix = metadataUri.slice('ipfs://'.length).replace(/^\/+/, '')
    if (!suffix) throw new Error('Invalid ipfs:// URI')
    return `${docResolverIpfsGateway}/${suffix}`
  }
  if (metadataUri.startsWith('https://')) return metadataUri
  if (metadataUri.startsWith('http://')) {
    if (!docResolverAllowInsecureHttp) {
      throw new Error('Insecure HTTP metadataUri blocked. Set DOC_RESOLVER_ALLOW_INSECURE_HTTP=true for local testing.')
    }
    return metadataUri
  }
  throw new Error('Unsupported metadataUri protocol. Use ipfs:// or https://')
}

const assertAllowedHost = (urlStr) => {
  if (docResolverAllowedHosts.length === 0) return
  const host = new URL(urlStr).host.toLowerCase()
  if (!docResolverAllowedHosts.includes(host)) {
    throw new Error(`metadataUri host ${host} is not in DOC_RESOLVER_ALLOWED_HOSTS allowlist`)
  }
}

const fetchDocumentBytes = async (urlStr) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('timeout'), docResolverTimeoutMs)
  try {
    const res = await fetch(urlStr, { method: 'GET', signal: controller.signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`Document fetch failed: status=${res.status}`)

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0) throw new Error('Document fetch returned empty body')
    if (bytes.length > docResolverMaxBytes) {
      throw new Error(`Document size ${bytes.length} exceeds DOC_RESOLVER_MAX_BYTES=${docResolverMaxBytes}`)
    }
    return bytes
  } finally {
    clearTimeout(timeout)
  }
}

const resolveAndExtractDocumentBundle = async ({ metadataUri, docBundleHash }) => {
  const url = resolveMetadataUriToHttpUrl(metadataUri)
  assertAllowedHost(url)
  const bytes = await fetchDocumentBytes(url)
  const sourceHash = keccak256(toHex(bytes))

  if (docBundleHash && String(docBundleHash).toLowerCase() !== sourceHash.toLowerCase()) {
    throw new Error(`Document hash mismatch: expected=${docBundleHash} actual=${sourceHash}`)
  }

  let json
  try {
    json = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch (e) {
    throw new Error(`Document bundle is not valid JSON: ${String(e?.message || e)}`)
  }

  const companyInfo = extractCompanyInfoFromDocument(json)
  const extractionHash = keccak256(toHex(canonicalStringify(companyInfo)))

  return {
    metadataUri,
    resolvedUrl: url,
    sourceHash,
    extractionHash,
    companyInfo,
  }
}

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

const toPaymentRequirements = async (req) => {
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
  const resolvedAsset = asset?.address || defaultAsset.address
  const resolvedEip712 = await resolveAssetEip712(network, resolvedAsset, asset?.eip712 || defaultAsset.eip712)

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
      asset: resolvedAsset,
      extra: resolvedEip712,
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

app.post('/docs/resolve', async (req, res) => {
  try {
    if (docResolverApiKey) {
      const key = String(req.header('x-doc-resolver-key') || '').trim()
      if (key !== docResolverApiKey) {
        return res.status(401).json({ error: 'Unauthorized doc resolver key' })
      }
    }

    const metadataUri = req.body?.metadataUri
    const docBundleHash = req.body?.docBundleHash
    const resolved = await resolveAndExtractDocumentBundle({ metadataUri, docBundleHash })
    return res.status(200).json(resolved)
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) })
  }
})

app.post('/pii/redact', async (req, res) => {
  try {
    if (piiRedactorApiKey) {
      const key = String(req.header('x-redactor-key') || '').trim()
      if (key !== piiRedactorApiKey) {
        return res.status(401).json({ error: 'Unauthorized redactor key' })
      }
    }

    const payload = req.body?.payload
    if (typeof payload === 'undefined') {
      return res.status(400).json({ error: 'Missing payload' })
    }

    const { redactedPayload, redactedFields } = redactPayload(payload)
    const redactionHash = keccak256(toHex(canonicalStringify(redactedPayload)))
    return res.status(200).json({
      redactedPayload,
      redactionHash,
      redactedFields,
      containsPii: redactedFields.length > 0,
    })
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) })
  }
})

app.post('/audit/webhook', async (req, res) => {
  try {
    if (auditWebhookApiKey) {
      const key = String(req.header('x-audit-key') || '').trim()
      if (key !== auditWebhookApiKey) {
        return res.status(401).json({ error: 'Unauthorized audit key' })
      }
    }

    const payload = req.body || {}
    const eventHash = keccak256(toHex(canonicalStringify(payload)))
    if (auditWebhookLogBody) {
      console.log(`[audit-webhook] accepted eventHash=${eventHash} payload=${JSON.stringify(payload)}`)
    } else {
      console.log(`[audit-webhook] accepted eventHash=${eventHash} event=${String(payload?.event || 'unknown')}`)
    }
    return res.status(200).json({ ok: true, eventHash, receivedAt: new Date().toISOString() })
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) })
  }
})

const sumsubVerify = async (payload) => {
  const subject = payload?.subject
  if (!subject || typeof subject !== 'string') throw new Error('Missing subject (wallet address) in request body')

  // ── Force-approve mode: skip Sumsub entirely, return APPROVED with high score ──
  if (forceApprove) {
    console.log(`[kyb-provider] FORCE_APPROVE=true → returning APPROVED for ${subject}`)
    const responseHash = sha256Hex(
      JSON.stringify({ subject, forceApproved: true, ts: Date.now() }),
    )
    return {
      providerStatus: 'APPROVED',
      providerScore: 10,
      providerResponseHash: `0x${responseHash.padEnd(64, '0').slice(0, 64)}`,
      sumsub: { applicantId: 'force-approved', reviewStatus: 'completed', reviewAnswer: 'GREEN' },
    }
  }

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

  const accepts = await toPaymentRequirements(req)
  const paymentHeader = req.header('X-PAYMENT')

  if (!paymentHeader) {
    return res.status(402).json({ x402Version, accepts })
  }

  try {
    const payload = decodePayment(paymentHeader)
    const paymentRequirements = accepts[0]

    const { verifyClient, settleClient } = getX402Clients(paymentRequirements.network)

    x402Log('[x402-debug] paymentRequirements.extra:', JSON.stringify(paymentRequirements.extra))
    x402Log('[x402-debug] payload.network:', payload.network)
    const verifyResp = await verify(verifyClient, payload, paymentRequirements)
    x402Log('[x402-debug] verifyResp:', JSON.stringify(verifyResp))
    if (!verifyResp?.isValid) {
      return res.status(402).json({
        x402Version,
        accepts,
        error: verifyResp?.invalidReason || 'unexpected_verify_error',
        payer: verifyResp?.payer,
      })
    }

    const settleResp = await settle(settleClient, payload, paymentRequirements)
    x402Log('[x402-debug] settleResp:', JSON.stringify(settleResp))
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
    if (x402Debug) console.error('[x402-debug] SETTLE ERROR:', e?.message || e)
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
  console.log(`[kyb-provider] listening on http://localhost:${port} (x402Enabled=${x402Enabled}, forceApprove=${forceApprove})`)
})
