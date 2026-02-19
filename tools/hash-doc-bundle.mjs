import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const getArg = (name, fallback = "") => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
};

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const castKeccak = (bytes) => {
  const hex = `0x${Buffer.from(bytes).toString("hex")}`;
  const out = spawnSync("cast", ["keccak", hex], { encoding: "utf8" });
  if (out.status !== 0) {
    fail(`cast keccak failed: ${out.stderr || out.stdout}`);
  }
  return (out.stdout || "").trim();
};

const resolveUri = (uri, gateway) => {
  if (uri.startsWith("ipfs://")) {
    const suffix = uri.slice("ipfs://".length).replace(/^\/+/, "");
    if (!suffix) fail("Invalid ipfs:// URI");
    return `${gateway.replace(/\/+$/, "")}/${suffix}`;
  }
  if (uri.startsWith("https://") || uri.startsWith("http://")) {
    return uri;
  }
  fail("Unsupported --uri scheme. Use ipfs:// or https://");
};

const normalizeCompanyInfo = (candidate) => {
  if (!candidate || typeof candidate !== "object") return null;
  const companyName = String(candidate.companyName || candidate.name || "").trim();
  const country = String(candidate.country || candidate.countryCode || "").trim();
  if (!companyName || !country) return null;
  const registrationNumber = String(
    candidate.registrationNumber || candidate.regNumber || candidate.companyNumber || "",
  ).trim();
  const website = String(candidate.website || candidate.url || "").trim();
  return {
    companyName,
    country,
    ...(registrationNumber ? { registrationNumber } : {}),
    ...(website ? { website } : {}),
  };
};

const extractCompanyInfo = (json) => {
  const candidates = [
    json?.companyInfo,
    json?.fixedInfo?.companyInfo,
    json?.company,
    json?.issuer?.companyInfo,
    json?.extracted?.companyInfo,
    json?.fields,
  ];
  for (const c of candidates) {
    const normalized = normalizeCompanyInfo(c);
    if (normalized) return normalized;
  }
  return null;
};

async function main() {
  const file = getArg("--file");
  const uri = getArg("--uri");
  const gateway = getArg("--gateway", "https://ipfs.io/ipfs");

  if (!file && !uri) {
    fail("Usage: node tools/hash-doc-bundle.mjs --file <path> OR --uri <ipfs://...>");
  }

  let bytes;
  let source = "";

  if (file) {
    bytes = readFileSync(file);
    source = file;
  } else {
    const resolved = resolveUri(uri, gateway);
    const res = await fetch(resolved);
    if (!res.ok) fail(`Fetch failed: ${resolved} status=${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
    source = resolved;
  }

  const hash = castKeccak(bytes);
  let json = null;
  try {
    json = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    json = null;
  }

  const companyInfo = json ? extractCompanyInfo(json) : null;
  console.log(
    JSON.stringify(
      {
        source,
        sizeBytes: bytes.length,
        docBundleHash: hash,
        companyInfoExtracted: companyInfo,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => fail(String(e?.message || e)));
