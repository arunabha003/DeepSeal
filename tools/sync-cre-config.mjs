import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const getArg = (name, fallback = undefined) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1];
};

const mustReadJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Failed to read JSON ${path}: ${err?.message || err}`);
  }
};

const pickChainId = (broadcastRoot, explicitChainId) => {
  if (explicitChainId) return explicitChainId;
  const entries = readdirSync(broadcastRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[0-9]+$/.test(d.name))
    .map((d) => d.name);
  if (entries.length === 0) throw new Error(`No chain-id directories found under ${broadcastRoot}`);
  return entries.sort((a, b) => Number(b) - Number(a))[0];
};

const deployMapFromBroadcast = (runJson) => {
  const out = new Map();
  for (const tx of runJson?.transactions || []) {
    if (!tx?.contractName || !tx?.contractAddress) continue;
    out.set(tx.contractName, tx.contractAddress);
  }
  return out;
};

const main = () => {
  const configPath =
    getArg("--config") || process.env.CRE_CONFIG_PATH || "cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json";
  const broadcastRoot = getArg("--broadcast-root") || "broadcast/Deploy.s.sol";
  const chainId = pickChainId(broadcastRoot, getArg("--chain-id") || process.env.CHAIN_ID);
  const runPath = join(broadcastRoot, chainId, "run-latest.json");

  const runJson = mustReadJson(runPath);
  const contracts = deployMapFromBroadcast(runJson);

  const diligencePortalAddress = contracts.get("DiligencePortal");
  const receiverAddress = contracts.get("RWAComplianceReceiver");
  if (!diligencePortalAddress || !receiverAddress) {
    throw new Error(
      `Could not find DiligencePortal/RWAComplianceReceiver in ${runPath}. Make sure script/Deploy.s.sol was run.`,
    );
  }

  const cfg = mustReadJson(configPath);
  cfg.diligencePortalAddress = diligencePortalAddress;
  cfg.receiverAddress = receiverAddress;

  writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);

  console.log(`Updated ${configPath}`);
  console.log(`- chainId: ${chainId}`);
  console.log(`- diligencePortalAddress: ${diligencePortalAddress}`);
  console.log(`- receiverAddress: ${receiverAddress}`);
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
