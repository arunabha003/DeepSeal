import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    return { ok: false, out: (r.stderr || r.stdout || "").trim() };
  }
  return { ok: true, out: (r.stdout || "").trim() };
}

function isZeroAddress(v) {
  return /^0x0{40}$/i.test(v);
}

function checkConfig() {
  const configPath =
    process.env.CRE_CONFIG_PATH || "cre/chainlink-Convergence/my-workflow/config.staging.json";
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    die(`Failed to read config: ${configPath} (${e?.message || e})`);
  }

  const missing = [];
  if (!cfg.chainSelectorName) missing.push("chainSelectorName");
  if (!cfg.diligencePortalAddress || isZeroAddress(cfg.diligencePortalAddress)) {
    missing.push("diligencePortalAddress (non-zero)");
  }
  if (!cfg.receiverAddress || isZeroAddress(cfg.receiverAddress)) {
    missing.push("receiverAddress (non-zero)");
  }
  if (!cfg.kybUrl) missing.push("kybUrl");
  if (!cfg.geminiModel) missing.push("geminiModel");

  if (missing.length) {
    die(`Config not ready (${configPath}): ${missing.join(", ")}`);
  }

  return { configPath, cfg };
}

function checkContractCode(address, rpcUrl, label) {
  const r = run("cast", ["code", address, "--rpc-url", rpcUrl]);
  if (!r.ok) die(`cast code failed for ${label}: ${r.out}`);
  if (!r.out || r.out === "0x") {
    die(`${label} has no code at ${address} on RPC ${rpcUrl}`);
  }
}

function main() {
  const { configPath, cfg } = checkConfig();
  const rpcUrl = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

  checkContractCode(cfg.diligencePortalAddress, rpcUrl, "DiligencePortal");
  checkContractCode(cfg.receiverAddress, rpcUrl, "RWAComplianceReceiver");

  const kyb = run("curl", ["-sf", `${cfg.kybUrl.replace(/\/kyb$/, "/healthz").replace(/\/kyb\/free$/, "/healthz")}`]);
  if (!kyb.ok) {
    die(`KYB provider health check failed: ${kyb.out}`);
  }

  console.log("Readiness check passed");
  console.log(`- Config: ${configPath}`);
  console.log(`- Portal: ${cfg.diligencePortalAddress}`);
  console.log(`- Receiver: ${cfg.receiverAddress}`);
  console.log(`- KYB URL: ${cfg.kybUrl}`);
}

main();

