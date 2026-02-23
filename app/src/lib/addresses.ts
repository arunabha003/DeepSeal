// Contract addresses for each network mode.
// "local" addresses are updated by `npm run sync-abis` after an Anvil deploy.
// "testnet" addresses were deployed to real Base Sepolia.

import { NETWORK, type NetworkMode } from "./network";

const LOCAL_ADDRESSES = {
  DemoUSD: "0xff196f1e3a895404d073b8611252cf97388773a7",
  ComplianceRegistry: "0xc36e784e1dff616bdae4eac7b310f0934faf04a4",
  DiligencePortal: "0x8071e429c7684fce0250287f1578397142503241",
  RWAComplianceReceiver: "0xb98e0fb673e5a0c6e15f1d0a9f36e7da954a0d5e",
  RWAVault: "0x78da752e9dbd73a9b0c0f5ddd15e854d2b879524",
  RWAAssetRegistry: "0x0000000000000000000000000000000000000000",
  RWAVaultFactory: "0x0000000000000000000000000000000000000000",
  IdentityRegistry: "0x1cf34658e7df9a46ad61486d007a8d62aec9891e",
  ReputationRegistry: "0x33d10f2449ffede92b43d4fba562f132ba6a766a",
  ValidationRegistry: "0xb9818483d01ca0e721849703c58148cfb81328fc",
} as const;

const TESTNET_ADDRESSES = {
  DemoUSD: "0x0a613896f3A69d7DA53e9c2503F01283966223C1",
  ComplianceRegistry: "0xa47749699925e9187906f5A0361D5073397279b3",
  DiligencePortal: "0xe6257bd26941cB6C3B977Fe2b2859aE7180396a4",
  RWAComplianceReceiver: "0x48935538CEbdb57b7B75D2476DC6C9b3A1cceDD6",
  RWAVault: "0x15FfbD328C9A0280027E04503A3F15b6bdea91e5",
  RWAAssetRegistry: "0xBd622016b404f668e63a31BB2b5ADe4aCf4ee2df",
  RWAVaultFactory: "0x9827E6289EC4309cdb3A7326bF4F1816e8B09B28",
  IdentityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  ReputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  ValidationRegistry: "0x7Ee89Ce38ece271262409210f2223205E3D76949",
} as const;

type AddressBook = { readonly [K in keyof typeof LOCAL_ADDRESSES]: `0x${string}` };

const ADDRESS_MAP: Record<NetworkMode, AddressBook> = {
  local: LOCAL_ADDRESSES,
  testnet: TESTNET_ADDRESSES,
};

export const ADDRESSES = ADDRESS_MAP[NETWORK];

// Re-export for use in sync scripts
export { LOCAL_ADDRESSES, TESTNET_ADDRESSES };
