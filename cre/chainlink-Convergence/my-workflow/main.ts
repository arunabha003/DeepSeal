import {
	bytesToHex,
	ConsensusAggregationByFields,
	ConfidentialHTTPClient,
	handler,
	EVMClient,
	HTTPClient,
	HTTPCapability,
	encodeCallMsg,
	getNetwork,
	type HTTPSendRequester,
	type ConfidentialHTTPSendRequester,
	hexToBase64,
	LAST_FINALIZED_BLOCK_NUMBER,
	Runner,
	type Runtime,
	TxStatus,
	identical,
	median,
} from '@chainlink/cre-sdk'
import {
	type Address,
	decodeFunctionResult,
	encodeAbiParameters,
	encodeFunctionData,
	hashTypedData,
	hexToBytes,
	keccak256,
	parseAbiParameters,
	concatHex,
	toHex,
	zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { secp256k1 } from '@noble/curves/secp256k1'
import { z } from 'zod'
import { DiligencePortal } from '../contracts/abi/DiligencePortal'

const configSchema = z.object({
	chainSelectorName: z.string(),
	diligencePortalAddress: z.string(),
	receiverAddress: z.string(),
	gasLimit: z.string(),
	kybUrl: z.string(),
	geminiModel: z.string(),
	useConfidentialHttp: z.boolean().optional(),
	x402Enabled: z.boolean().optional(),
})

type Config = z.infer<typeof configSchema>

const requestSchema = z.object({
	requestId: z.union([z.number().int().positive(), z.string().regex(/^[0-9]+$/)]),
	companyInfo: z
		.object({
			companyName: z.string().min(1),
			country: z.string().min(2),
			registrationNumber: z.string().optional(),
			incorporatedOn: z.string().optional(),
			website: z.string().optional(),
		})
		.optional(),
})

type DiligenceRequest = {
	requester: Address
	subject: Address
	docBundleHash: `0x${string}`
	metadataUri: string
	requestedAt: bigint
}

type KYBResult = {
	providerStatus: 'APPROVED' | 'REJECTED'
	providerScore: number
	providerResponseHash: `0x${string}`
	xPaymentResponseHeader?: string
}

type RiskJson = {
	approved: boolean
	riskScore: number
	reasons: string[]
}

type RiskObservation = {
	approved: boolean
	riskScore: number
	reasonsText: string
}

const decodeBodyUtf8 = (body: Uint8Array): string => Buffer.from(body).toString('utf-8')

const safeJsonParse = (s: string): any => {
	try {
		return JSON.parse(s)
	} catch (e: any) {
		throw new Error(`Failed to parse JSON: ${e?.message || e}. Raw=${s}`)
	}
}

type X402Accept = {
	scheme: 'exact'
	network: string
	maxAmountRequired: string
	resource: string
	payTo: string
	asset: string
	extra?: { name?: string; version?: string }
	maxTimeoutSeconds: number
}

const x402ResponseSchema = z.object({
	x402Version: z.number().optional(),
	accepts: z.array(
		z.object({
			scheme: z.literal('exact'),
			network: z.string(),
			maxAmountRequired: z.string(),
			resource: z.string().optional(),
			payTo: z.string(),
			asset: z.string(),
			extra: z.record(z.any()).optional(),
			maxTimeoutSeconds: z.number().int().positive().optional(),
		}),
	),
})

const networkToChainId = (network: string): number => {
	switch (network) {
		case 'base-sepolia':
			return 84532
		case 'base':
			return 8453
		case 'avalanche-fuji':
			return 43113
		case 'avalanche':
			return 43114
		case 'polygon-amoy':
			return 80002
		case 'polygon':
			return 137
		default:
			throw new Error(`Unsupported x402 network for buyer flow: ${network}`)
	}
}

const buildXPaymentHeaderExactEvm = (accept: X402Accept, buyerPrivateKey: `0x${string}`, nonceSeed: string): string => {
	const account = privateKeyToAccount(buyerPrivateKey)
	const from = account.address
	const to = accept.payTo as Address
	const value = BigInt(accept.maxAmountRequired)
	const now = BigInt(Math.floor(Date.now() / 1000))
	const validAfter = now > 10n ? now - 10n : 0n
	const timeout = BigInt(accept.maxTimeoutSeconds || 120)
	const validBefore = now + timeout
	const nonce = keccak256(toHex(`${nonceSeed}:${Date.now().toString()}`))

	const chainId = networkToChainId(accept.network)
	const domain = {
		name: (accept.extra?.name as string) || 'USD Coin',
		version: (accept.extra?.version as string) || '2',
		chainId,
		verifyingContract: accept.asset as Address,
	} as const

	const types = {
		TransferWithAuthorization: [
			{ name: 'from', type: 'address' },
			{ name: 'to', type: 'address' },
			{ name: 'value', type: 'uint256' },
			{ name: 'validAfter', type: 'uint256' },
			{ name: 'validBefore', type: 'uint256' },
			{ name: 'nonce', type: 'bytes32' },
		],
	} as const

	const message = {
		from,
		to,
		value,
		validAfter,
		validBefore,
		nonce,
	} as const

	const digest = hashTypedData({
		domain,
		types,
		primaryType: 'TransferWithAuthorization',
		message,
	})
	const sig = secp256k1.sign(hexToBytes(digest), hexToBytes(buyerPrivateKey))
	const v = (sig.recovery ?? 0) + 27
	const signature = (`0x${sig.toCompactHex()}${v.toString(16).padStart(2, '0')}`) as `0x${string}`

	const payload = {
		x402Version: 1,
		scheme: 'exact',
		network: accept.network,
		payload: {
			signature,
			authorization: {
				from,
				to,
				value: value.toString(),
				validAfter: validAfter.toString(),
				validBefore: validBefore.toString(),
				nonce,
			},
		},
	}

	return Buffer.from(JSON.stringify(payload)).toString('base64')
}

const fetchKybHttp = (
	sendRequester: HTTPSendRequester,
	config: Config,
	req: DiligenceRequest,
	runtime: Runtime<Config>,
	companyInfo?: any,
): KYBResult => {
	const body = Buffer.from(
		new TextEncoder().encode(
			JSON.stringify({
				subject: req.subject,
				docBundleHash: req.docBundleHash,
				metadataUri: req.metadataUri,
				companyInfo: companyInfo || undefined,
			}),
		),
	).toString('base64')

	const initial = sendRequester
		.sendRequest({
			method: 'POST',
			url: config.kybUrl,
			headers: { 'content-type': 'application/json' },
			body,
		})
		.result()

	// x402 buyer flow (optional): if paywalled, retry with X-PAYMENT
	if (initial.statusCode === 402 && Boolean(config.x402Enabled)) {
		const secret = runtime.getSecret({ id: 'X402_BUYER_PRIVATE_KEY' }).result()
		const buyerPk = secret.value as `0x${string}`
		if (!buyerPk) throw new Error('Missing secret: X402_BUYER_PRIVATE_KEY')

		const parsed402 = x402ResponseSchema.parse(safeJsonParse(decodeBodyUtf8(initial.body)))
		const accept0 = parsed402.accepts[0] as any
		const accept: X402Accept = {
			scheme: 'exact',
			network: accept0.network,
			maxAmountRequired: accept0.maxAmountRequired,
			resource: accept0.resource || config.kybUrl,
			payTo: accept0.payTo,
			asset: accept0.asset,
			extra: (accept0.extra as any) || {},
			maxTimeoutSeconds: accept0.maxTimeoutSeconds || 120,
		}

		const xPayment = buildXPaymentHeaderExactEvm(accept, buyerPk, `kyb:${req.subject}:${req.docBundleHash}`)

		const paid = sendRequester
			.sendRequest({
				method: 'POST',
				url: config.kybUrl.replace(/\/kyb\/free$/, '/kyb'),
				headers: { 'content-type': 'application/json', 'X-PAYMENT': xPayment },
				body,
			})
			.result()

		if (paid.statusCode < 200 || paid.statusCode >= 300) {
			throw new Error(`KYB x402-paid request failed with status: ${paid.statusCode} body=${decodeBodyUtf8(paid.body)}`)
		}

		const parsed = safeJsonParse(decodeBodyUtf8(paid.body))
		return {
			providerStatus: parsed.providerStatus,
			providerScore: parsed.providerScore,
			providerResponseHash: parsed.providerResponseHash,
			xPaymentResponseHeader: paid.headers?.['X-PAYMENT-RESPONSE'] || paid.headers?.['x-payment-response'],
		} as KYBResult
	}

	if (initial.statusCode < 200 || initial.statusCode >= 300) {
		throw new Error(`KYB HTTP request failed with status: ${initial.statusCode} body=${decodeBodyUtf8(initial.body)}`)
	}

	const parsed = safeJsonParse(decodeBodyUtf8(initial.body))
	return {
		providerStatus: parsed.providerStatus,
		providerScore: parsed.providerScore,
		providerResponseHash: parsed.providerResponseHash,
	} as KYBResult
}

const fetchKybConfidential = (
	sendRequester: ConfidentialHTTPSendRequester,
	config: Config,
	req: DiligenceRequest,
	runtime: Runtime<Config>,
	companyInfo?: any,
): KYBResult => {
	const bodyString = JSON.stringify({
		subject: req.subject,
		docBundleHash: req.docBundleHash,
		metadataUri: req.metadataUri,
		companyInfo: companyInfo || undefined,
	})

	const initial = sendRequester
		.sendRequest({
			vaultDonSecrets: [],
			encryptOutput: false,
			request: {
				method: 'POST',
				url: config.kybUrl,
				bodyString,
				multiHeaders: { 'content-type': { values: ['application/json'] } },
			},
		})
		.result()

	// x402 buyer flow is only implemented for standard HTTP for now (header encoding + retry).
	if (initial.statusCode < 200 || initial.statusCode >= 300) {
		throw new Error(
			`KYB Confidential HTTP request failed with status: ${initial.statusCode} body=${decodeBodyUtf8(initial.body)}`,
		)
	}

	const parsed = safeJsonParse(decodeBodyUtf8(initial.body))
	return {
		providerStatus: parsed.providerStatus,
		providerScore: parsed.providerScore,
		providerResponseHash: parsed.providerResponseHash,
	} as KYBResult
}

const fetchGeminiRisk = (
	sendRequester: HTTPSendRequester,
	config: Config,
	apiKey: string,
	prompt: string,
): RiskObservation => {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
		config.geminiModel,
	)}:generateContent?key=${encodeURIComponent(apiKey)}`

	const bodyBytes = new TextEncoder().encode(
		JSON.stringify({
			contents: [{ role: 'user', parts: [{ text: prompt }] }],
			generationConfig: {
				responseMimeType: 'application/json',
				temperature: 0,
			},
		}),
	)
	const body = Buffer.from(bodyBytes).toString('base64')

	const response = sendRequester
		.sendRequest({
			method: 'POST',
			url,
			headers: { 'content-type': 'application/json' },
			body,
		})
		.result()

	if (response.statusCode < 200 || response.statusCode >= 300) {
		throw new Error(`Gemini HTTP request failed with status: ${response.statusCode} body=${decodeBodyUtf8(response.body)}`)
	}

	const jsonResp = safeJsonParse(decodeBodyUtf8(response.body)) as any
	const outText =
		(jsonResp?.candidates?.[0]?.content?.parts ?? [])
			.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
			.join('') || ''

	const parseRiskJson = (raw: string): RiskJson => {
		const trimmed = raw.trim()
		const attempts: string[] = [trimmed]
		if (trimmed.startsWith('```')) {
			const noFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
			attempts.push(noFence)
		}
		const firstObj = trimmed.indexOf('{')
		const lastObj = trimmed.lastIndexOf('}')
		if (firstObj >= 0 && lastObj > firstObj) {
			attempts.push(trimmed.slice(firstObj, lastObj + 1))
		}

		for (const candidate of attempts) {
			try {
				return JSON.parse(candidate) as RiskJson
			} catch {
				// try next shape
			}
		}
		throw new Error(`Gemini did not return parseable JSON. Got: ${raw}`)
	}

	const risk = parseRiskJson(outText)

	if (typeof risk.approved !== 'boolean') throw new Error('risk.approved must be boolean')
	if (typeof risk.riskScore !== 'number') throw new Error('risk.riskScore must be number')
	if (!Array.isArray(risk.reasons)) throw new Error('risk.reasons must be string[]')

	return {
		approved: risk.approved,
		riskScore: risk.riskScore,
		reasonsText: JSON.stringify(risk.reasons),
	}
}

const readRequestFromPortal = (runtime: Runtime<Config>, requestId: bigint): DiligenceRequest => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found for chain selector name: ${runtime.config.chainSelectorName}`)
	}

	const evmClient = new EVMClient(network.chainSelector.selector)

	const callData = encodeFunctionData({
		abi: DiligencePortal,
		functionName: 'getRequest',
		args: [requestId],
	})

	const contractCall = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.diligencePortalAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()

	const decoded = decodeFunctionResult({
		abi: DiligencePortal,
		functionName: 'getRequest',
		data: bytesToHex(contractCall.data),
	}) as any

	const rec = Array.isArray(decoded) ? decoded[0] : decoded
	return {
		requester: rec.requester,
		subject: rec.subject,
		docBundleHash: rec.docBundleHash,
		metadataUri: rec.metadataUri,
		requestedAt: rec.requestedAt,
	} as DiligenceRequest
}

const writeDecision = (runtime: Runtime<Config>, reportHex: `0x${string}`): string => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found for chain selector name: ${runtime.config.chainSelectorName}`)
	}

	const evmClient = new EVMClient(network.chainSelector.selector)

	const reportResponse = runtime
		.report({
			encodedPayload: hexToBase64(reportHex),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: runtime.config.receiverAddress,
			report: reportResponse,
			gasConfig: { gasLimit: runtime.config.gasLimit },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Failed to write report: ${resp.errorMessage || resp.txStatus}`)
	}

	const txHash = resp.txHash || new Uint8Array(32)
	runtime.log(`Write report transaction succeeded at txHash: ${bytesToHex(txHash)}`)
	return bytesToHex(txHash)
}

const onHttpTrigger = async (runtime: Runtime<Config>, payload: any): Promise<string> => {
	const inputJson = Buffer.from(payload.input).toString('utf-8')
	const parsed = requestSchema.parse(JSON.parse(inputJson))
	const requestId = BigInt(typeof parsed.requestId === 'string' ? parsed.requestId : parsed.requestId)
	const companyInfo = parsed.companyInfo

	runtime.log(`Processing diligence requestId=${requestId.toString()}`)

	const req = readRequestFromPortal(runtime, requestId)
	runtime.log(`subject=${req.subject} docBundleHash=${req.docBundleHash} metadataUri=${req.metadataUri}`)

	const useConf = Boolean(runtime.config.useConfidentialHttp)
	const kyb = useConf
		? new ConfidentialHTTPClient()
				.sendRequest(
					runtime,
					(sr: ConfidentialHTTPSendRequester, cfg: Config) =>
						fetchKybConfidential(sr, cfg, req, runtime, companyInfo),
					ConsensusAggregationByFields<KYBResult>({
						providerStatus: identical,
						providerScore: median,
						providerResponseHash: identical,
					}),
				)(runtime.config)
				.result()
		: new HTTPClient()
				.sendRequest(
					runtime,
					(sr: HTTPSendRequester, cfg: Config) => fetchKybHttp(sr, cfg, req, runtime, companyInfo),
					ConsensusAggregationByFields<KYBResult>({
						providerStatus: identical,
						providerScore: median,
						providerResponseHash: identical,
					}),
				)(runtime.config)
				.result()
	runtime.log(`KYB providerStatus=${kyb.providerStatus} providerScore=${kyb.providerScore}`)

	const prompt = [
		'You are an RWA compliance risk model.',
		'Return ONLY valid JSON with keys: approved(boolean), riskScore(number 0-1000), reasons(array of strings).',
		'No markdown, no code fences.',
		'',
		'Input:',
		JSON.stringify(
			{
				requestId: requestId.toString(),
				subject: req.subject,
				docBundleHash: req.docBundleHash,
				metadataUri: req.metadataUri,
				kyb,
			},
			null,
			2,
		),
	].join('\n')

	const secret = runtime.getSecret({ id: 'GEMINI_API_KEY' }).result()
	const apiKey = secret.value
	if (!apiKey) throw new Error('Missing secret: GEMINI_API_KEY')

	const geminiRisk = new HTTPClient()
		.sendRequest(
			runtime,
			(sr: HTTPSendRequester, cfg: Config) => fetchGeminiRisk(sr, cfg, apiKey, prompt),
			ConsensusAggregationByFields<RiskObservation>({
				approved: identical,
				riskScore: median,
				reasonsText: identical,
			}),
		)(runtime.config)
		.result()

	const approved = Boolean(geminiRisk.approved && kyb.providerStatus === 'APPROVED')
	const riskScore = Math.max(0, Math.min(1000, Math.floor(geminiRisk.riskScore)))

	const normalizedRisk: RiskJson = {
		approved,
		riskScore,
		reasons: JSON.parse(geminiRisk.reasonsText) as string[],
	}

	const reportJson = JSON.stringify(normalizedRisk)
	const reportHash = keccak256(toHex(reportJson))
	const providerHash = kyb.providerResponseHash

	const attestationHash = keccak256(concatHex([req.docBundleHash, providerHash, reportHash]))

	const reportHex = encodeAbiParameters(
		parseAbiParameters('address subject, bool approved, uint32 riskScore, bytes32 attestationHash'),
		[req.subject, approved, riskScore, attestationHash],
	)

	const tx = writeDecision(runtime, reportHex)

	return JSON.stringify({
		requestId: requestId.toString(),
		subject: req.subject,
		approved,
		riskScore,
		providerResponseHash: providerHash,
		reportHash,
		attestationHash,
		txHash: tx,
	})
}

const initWorkflow = (config: Config) => {
	const httpTrigger = new HTTPCapability()
	return [handler(httpTrigger.trigger({}), onHttpTrigger)]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({
		configSchema,
	})
	await runner.run(initWorkflow)
}
