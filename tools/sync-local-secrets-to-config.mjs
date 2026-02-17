import { readFileSync, writeFileSync } from "node:fs";

const getArg = (name, fallback = undefined) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1];
};

const envPath = getArg("--env", "cre/chainlink-Convergence/.env");
const configPath = getArg("--config", "cre/chainlink-Convergence/my-workflow/config.anvil-e2e.json");

const parseEnv = (raw) => {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
};

try {
  const env = parseEnv(readFileSync(envPath, "utf8"));
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));

  const gemini = String(env.GEMINI_API_KEY || "");
  const x402Buyer = String(env.X402_BUYER_PRIVATE_KEY || "");

  cfg.geminiApiKey = gemini;
  cfg.x402BuyerPrivateKey = x402Buyer;

  writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);

  console.log(`Updated ${configPath}`);
  console.log(`- geminiApiKey: ${gemini ? `set (len=${gemini.length})` : "empty"}`);
  console.log(`- x402BuyerPrivateKey: ${x402Buyer ? "set" : "empty"}`);
} catch (err) {
  console.error(`Failed: ${err?.message || err}`);
  process.exit(1);
}
