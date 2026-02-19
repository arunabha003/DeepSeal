// Auto-sync script: reads broadcast/Deploy.s.sol/84532/run-latest.json
// and updates LOCAL_ADDRESSES in src/lib/addresses.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

const broadcastPath = join(root, "broadcast/Deploy.s.sol/84532/run-latest.json");
const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));

const nameMap = {};
for (const tx of broadcast.transactions || []) {
  if (tx.contractName && tx.contractAddress) {
    nameMap[tx.contractName] = tx.contractAddress;
  }
}

const addresses = {
  DemoUSD: nameMap.DemoUSD,
  ComplianceRegistry: nameMap.ComplianceRegistry,
  DiligencePortal: nameMap.DiligencePortal,
  RWAComplianceReceiver: nameMap.RWAComplianceReceiver,
  RWAVault: nameMap.RWAVault,
  IdentityRegistry: nameMap.IdentityRegistry,
  ReputationRegistry: nameMap.ReputationRegistry,
  ValidationRegistry: nameMap.ValidationRegistry,
};

// Read the existing addresses.ts and update only the LOCAL_ADDRESSES block
const addressesPath = join(__dirname, "..", "src/lib/addresses.ts");
let content = readFileSync(addressesPath, "utf8");

const localBlock = `const LOCAL_ADDRESSES = ${JSON.stringify(addresses, null, 2)} as const;`;
content = content.replace(
  /const LOCAL_ADDRESSES = \{[\s\S]*?\} as const;/,
  localBlock,
);

writeFileSync(addressesPath, content);
console.log("Updated LOCAL_ADDRESSES in src/lib/addresses.ts", addresses);
