import dotenv from 'dotenv'
import crypto from 'node:crypto'
import express from 'express'

dotenv.config({ path: new URL('../.env', import.meta.url) })

import { decodePayment } from 'x402/schemes'
import { getDefaultAsset, processPriceToAtomicAmount } from 'x402/shared'
import { settleResponseHeader } from 'x402/types'
import { settle, verify } from 'x402/verify'

const app = express()
app.use(express.json({ limit: '2mb' }))

const port = Number(process.env.PORT || 3001)
const x402Enabled = String(process.env.X402_ENABLED || 'false').toLowerCase() === 'true'
const x402Version = Number(process.env.X402_VERSION || 1)

const mustEnv = (name) => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

const toPaymentRequirements = (req) => {
  const payTo = mustEnv('X402_PAY_TO')
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
      description: 'KYB verification (mock logic, real x402 payment rail)',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: timeout,
      asset: asset?.address || defaultAsset.address,
      extra: asset?.eip712 || defaultAsset.eip712,
    },
  ]
}

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, x402Enabled }))

const compute = (payload) => {
  const raw = JSON.stringify(payload ?? {})
  const digest = crypto.createHash('sha256').update(raw).digest('hex')
  const score = parseInt(digest.slice(0, 4), 16) % 1000
  const providerStatus = score <= 700 ? 'APPROVED' : 'REJECTED'

  return {
    providerStatus,
    providerScore: score,
    providerResponseHash: `0x${digest.padEnd(64, '0').slice(0, 64)}`,
  }
}

// Free path for CRE workflow simulation until x402 buyer support is wired in.
app.post('/kyb/free', (req, res) => {
  res.status(200).json(compute(req.body))
})

// Paywalled path when X402_ENABLED=true.
app.post('/kyb', async (req, res) => {
  if (!x402Enabled) {
    return res.status(200).json(compute(req.body))
  }

  const accepts = toPaymentRequirements(req)
  const paymentHeader = req.header('X-PAYMENT')

  if (!paymentHeader) {
    return res.status(402).json({ x402Version, accepts })
  }

  try {
    const payload = decodePayment(paymentHeader)
    const paymentRequirements = accepts[0]

    const verifyResp = await verify(payload, paymentRequirements)
    if (!verifyResp?.isValid) {
      return res.status(402).json({
        x402Version,
        accepts,
        error: verifyResp?.invalidReason || 'unexpected_verify_error',
        payer: verifyResp?.payer,
      })
    }

    const settleResp = await settle(payload, paymentRequirements)
    if (!settleResp?.success) {
      return res.status(402).json({
        x402Version,
        accepts,
        error: settleResp?.errorReason || 'unexpected_settle_error',
        payer: settleResp?.payer,
      })
    }

    res.setHeader('X-PAYMENT-RESPONSE', settleResponseHeader(settleResp))
    return res.status(200).json(compute(req.body))
  } catch (e) {
    return res.status(402).json({
      x402Version,
      accepts,
      error: 'unexpected_verify_error',
      detail: String(e?.message || e),
    })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[kyb-provider] listening on http://localhost:${port} (x402Enabled=${x402Enabled})`)
})
