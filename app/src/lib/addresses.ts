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
  DemoUSD: "0xFb2518e2017b36f00827409153818747A3e6d3f9",
  ComplianceRegistry: "0x590552A4d4eF77F3AbD25C76fA8f304f2388b9e5",
  DiligencePortal: "0x337c75270D09A8D8BFCe386F93715E230b39E48c",
  RWAComplianceReceiver: "0x7cbFd330F61723c215c5061eD3b1A75CCCbF4e42",
  RWAVault: "0xF1DBec54913B58f65806C7F77D636b3f40882293",
  IdentityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  ReputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  ValidationRegistry: "0x7ba22271A22D84807C501bCb6deeF76966262BE6",
} as const;

type AddressBook = { readonly [K in keyof typeof LOCAL_ADDRESSES]: `0x${string}` };

const ADDRESS_MAP: Record<NetworkMode, AddressBook> = {
  local: LOCAL_ADDRESSES,
  testnet: TESTNET_ADDRESSES,
};

export const ADDRESSES = ADDRESS_MAP[NETWORK];

// Re-export for use in sync scripts
export { LOCAL_ADDRESSES, TESTNET_ADDRESSES };
