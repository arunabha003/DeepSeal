import {
	bytesToHex,
	ConsensusAggregationByFields,
	handler,
	EVMClient,
	HTTPClient,
	HTTPCapability,
	encodeCallMsg,
	getNetwork,
	type HTTPSendRequester,
	hexToBase64,
	LAST_FINALIZED_BLOCK_NUMBER,
	Runner,
	type Runtime,
	TxStatus,
	identical,
	median,
	ok,
	text,
} from '@chainlink/cre-sdk'
import {
	type Address,
	decodeFunctionResult,
	encodeAbiParameters,
	encodeFunctionData,
	keccak256,
	parseAbiParameters,
	concatHex,
	toHex,
	zeroAddress,
} from 'viem'
import { z } from 'zod'
import { DiligencePortal } from '../contracts/abi/DiligencePortal'

const configSchema = z.object({
	chainSelectorName: z.string(),
	diligencePortalAddress: z.string(),
	receiverAddress: z.string(),
	gasLimit: z.string(),
	kybUrl: z.string(),
	geminiModel: z.string(),
})

type Config = z.infer<typeof configSchema>

const requestSchema = z.object({
	requestId: z.union([z.number().int().positive(), z.string().regex(/^[0-9]+$/)]),
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

const fetchKyb = (sendRequester: HTTPSendRequester, config: Config, req: DiligenceRequest): KYBResult => {
	const bodyBytes = new TextEncoder().encode(
		JSON.stringify({
			subject: req.subject,
			docBundleHash: req.docBundleHash,
			metadataUri: req.metadataUri,
		}),
	)
	const body = Buffer.from(bodyBytes).toString('base64')

	const response = sendRequester
		.sendRequest({
			method: 'POST',
			url: config.kybUrl,
			headers: { 'content-type': 'application/json' },
			body,
		})
		.result()

	if (!ok(response)) {
		throw new Error(`KYB HTTP request failed with status: ${response.statusCode} body=${text(response)}`)
	}

	const parsed = JSON.parse(text(response)) as any
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

	if (!ok(response)) {
		throw new Error(`Gemini HTTP request failed with status: ${response.statusCode} body=${text(response)}`)
	}

	const jsonResp = JSON.parse(text(response)) as any
	const outText =
		(jsonResp?.candidates?.[0]?.content?.parts ?? [])
			.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
			.join('') || ''

	let risk: RiskJson
	try {
		risk = JSON.parse(outText) as RiskJson
	} catch {
		throw new Error(`Gemini did not return strict JSON. Got: ${outText}`)
	}

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

	runtime.log(`Processing diligence requestId=${requestId.toString()}`)

	const req = readRequestFromPortal(runtime, requestId)
	runtime.log(`subject=${req.subject} docBundleHash=${req.docBundleHash} metadataUri=${req.metadataUri}`)

	const http = new HTTPClient()
	const kyb = http
		.sendRequest(
			runtime,
			(sr: HTTPSendRequester, cfg: Config) => fetchKyb(sr, cfg, req),
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

	const geminiRisk = http
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
