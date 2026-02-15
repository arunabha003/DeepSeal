import crypto from 'node:crypto'
import express from 'express'

let paymentMiddleware
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  ;({ paymentMiddleware } = await import('x402'))
} catch {
  paymentMiddleware = null
}

const app = express()
app.use(express.json({ limit: '2mb' }))

const port = Number(process.env.PORT || 3001)
const x402Enabled = String(process.env.X402_ENABLED || 'false').toLowerCase() === 'true'

if (x402Enabled) {
  if (!paymentMiddleware) {
    throw new Error(
      'X402_ENABLED=true but `x402` could not be imported. Run `npm install` in services/kyb-provider.',
    )
  }
  app.use(
    paymentMiddleware({
      'POST /kyb': { accepts: ['USDC'], price: process.env.KYB_PRICE || '0.01' },
    }),
  )
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
app.post('/kyb', (req, res) => {
  res.status(200).json(compute(req.body))
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[kyb-provider] listening on http://localhost:${port} (x402Enabled=${x402Enabled})`)
})

