import dotenv from 'dotenv'
import crypto from 'node:crypto'

dotenv.config({ path: new URL('../.env', import.meta.url) })

const sumsubBaseUrl = String(process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com').replace(/\/+$/, '')
const sumsubToken = process.env.SUMSUB_APP_TOKEN
const sumsubSecret = process.env.SUMSUB_SECRET_KEY || process.env.SUMSUB_SECRET
const isConfigured = Boolean(sumsubToken && sumsubSecret)

if (!isConfigured) {
  console.error(
    JSON.stringify(
      {
        configured: false,
        authValid: false,
        error: 'Missing SUMSUB_APP_TOKEN or SUMSUB_SECRET_KEY in services/kyb-provider/.env',
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

const hmacSha256Hex = (secretKey, msg) =>
  crypto.createHmac('sha256', secretKey).update(msg, 'utf8').digest('hex')

const run = async () => {
  const probeExternalUserId = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const path = `/resources/applicants/-;externalUserId=${encodeURIComponent(probeExternalUserId)}/one`
  const url = new URL(sumsubBaseUrl + path)
  const method = 'GET'
  const ts = Math.floor(Date.now() / 1000).toString()
  const bodyStr = ''
  const sig = hmacSha256Hex(sumsubSecret, ts + method + url.pathname + url.search + bodyStr)

  const response = await fetch(url, {
    method,
    headers: {
      'X-App-Token': sumsubToken,
      'X-App-Access-Sig': sig,
      'X-App-Access-Ts': ts,
    },
  })

  const text = await response.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }

  const authValid = response.status !== 401 && response.status !== 403
  const output = {
    configured: true,
    authValid,
    status: response.status,
    message: authValid
      ? 'Auth signature accepted by Sumsub.'
      : 'Sumsub rejected auth/signature. Check SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY.',
    response: parsed,
  }

  const printer = authValid ? console.log : console.error
  printer(JSON.stringify(output, null, 2))
  process.exit(authValid ? 0 : 1)
}

run().catch((err) => {
  console.error(
    JSON.stringify(
      {
        configured: true,
        authValid: false,
        error: String(err?.message || err),
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
