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
  IdentityRegistry: "0x1cf34658e7df9a46ad61486d007a8d62aec9891e",
  ReputationRegistry: "0x33d10f2449ffede92b43d4fba562f132ba6a766a",
  ValidationRegistry: "0xb9818483d01ca0e721849703c58148cfb81328fc",
} as const;

const TESTNET_ADDRESSES = {
  DemoUSD: "0x523E3033F844B1E2175183846ADFD7190EDECD4a",
  ComplianceRegistry: "0x78383225EA842251361CE7104456322d4d151D66",
  DiligencePortal: "0xa5A29714cb9c51A10a165cBe2025372640abb9e5",
  RWAComplianceReceiver: "0x16b1D017F22F2aB47bA3eA1948ff973A024CCB4F",
  RWAVault: "0x65054D2De227b7e823a0c13fc0C5D6c62198963d",
  IdentityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  ReputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  ValidationRegistry: "0xa30004dfA091b5bD9B019Fa31b490847929555EC",
} as const;

type AddressBook = { readonly [K in keyof typeof LOCAL_ADDRESSES]: `0x${string}` };

const ADDRESS_MAP: Record<NetworkMode, AddressBook> = {
  local: LOCAL_ADDRESSES,
  testnet: TESTNET_ADDRESSES,
};

export const ADDRESSES = ADDRESS_MAP[NETWORK];

// Re-export for use in sync scripts
export { LOCAL_ADDRESSES, TESTNET_ADDRESSES };
