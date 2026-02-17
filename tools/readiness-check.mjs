import { existsSync, readFileSync } from "node:fs";
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
    process.env.CRE_CONFIG_PATH ||
    [
      "cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json",
      "cre/chainlink-Convergence/my-workflow/config.staging.json",
      "cre/chainlink-Convergence/my-workflow/config.production.json",
    ].find((p) => existsSync(p));
  if (!configPath) {
    die("No CRE config file found. Set CRE_CONFIG_PATH explicitly.");
  }
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

  const sumsubProbe = run("curl", ["-sf", "http://127.0.0.1:3001/sumsub/healthz"]);
  if (!sumsubProbe.ok) {
    console.log("- Sumsub probe: skipped/unreachable (provider may be down or endpoint unavailable)");
  } else {
    console.log(`- Sumsub probe: ${sumsubProbe.out}`);
  }

  console.log("Readiness check passed");
  console.log(`- Config: ${configPath}`);
  console.log(`- Portal: ${cfg.diligencePortalAddress}`);
  console.log(`- Receiver: ${cfg.receiverAddress}`);
  console.log(`- KYB URL: ${cfg.kybUrl}`);
}

main();
