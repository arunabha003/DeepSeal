export const DiligencePortal = [
	{
		inputs: [{ internalType: 'uint256', name: 'requestId', type: 'uint256' }],
		name: 'getRequest',
		outputs: [
			{
				components: [
					{ internalType: 'address', name: 'requester', type: 'address' },
					{ internalType: 'address', name: 'subject', type: 'address' },
					{ internalType: 'bytes32', name: 'docBundleHash', type: 'bytes32' },
					{ internalType: 'string', name: 'metadataUri', type: 'string' },
					{ internalType: 'uint64', name: 'requestedAt', type: 'uint64' },
				],
				internalType: 'struct DiligencePortal.Request',
				name: '',
				type: 'tuple',
			},
		],
		stateMutability: 'view',
		type: 'function',
	},
] as const

