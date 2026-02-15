import { spawnSync } from "node:child_process";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function sh(cmd, args, { silent = false } = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  }
  if (!silent && r.stderr) process.stderr.write(r.stderr);
  return (r.stdout ?? "").trim();
}

function hexConcat32(a, b, c) {
  const strip = (x) => x.toLowerCase().replace(/^0x/, "");
  return "0x" + strip(a) + strip(b) + strip(c);
}

async function main() {
  const rpcUrl = mustEnv("RPC_URL");
  const privateKey = mustEnv("PRIVATE_KEY");

  const portal = mustEnv("PORTAL_ADDRESS");
  const receiver = mustEnv("RECEIVER_ADDRESS");

  const requestId = mustEnv("REQUEST_ID");
  const kybUrl = process.env.KYB_URL ?? "http://127.0.0.1:3001/kyb/free";

  const geminiKey = mustEnv("GEMINI_API_KEY");
  const geminiModel = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";

  // 1) Read request from chain (no deps: use cast)
  // getRequest(uint256) -> (address requester,address subject,bytes32 docBundleHash,string metadataUri,uint64 requestedAt)
  const raw = sh("cast", [
    "call",
    portal,
    "getRequest(uint256)((address,address,bytes32,string,uint64))",
    requestId,
    "--rpc-url",
    rpcUrl,
  ]);

  // raw output is ABI-decoded tuple formatting; easiest to re-call as JSON via `cast --json` isn’t stable.
  // We instead call each field by decoding with `cast abi-decode` using the exact type.
  const decoded = sh("cast", [
    "abi-decode",
    "f((address,address,bytes32,string,uint64))",
    raw,
  ]);

  // decoded format: (0xRequester, 0xSubject, 0xDocHash, "uri", 123)
  // Use a simple parser that relies on cast formatting.
  const m = decoded.match(
    /^\(\s*(0x[a-fA-F0-9]{40})\s*,\s*(0x[a-fA-F0-9]{40})\s*,\s*(0x[a-fA-F0-9]{64})\s*,\s*"(.*)"\s*,\s*(\d+)\s*\)\s*$/
  );
  if (!m) throw new Error(`Unexpected decode format:\n${decoded}`);

  const [, requester, subject, docBundleHash, metadataUri] = m;

  // 2) KYB verification (mock provider for now)
  const kybResp = await fetch(kybUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subject, docBundleHash, metadataUri }),
  });
  const kybJson = await kybResp.json();
  if (!kybResp.ok) throw new Error(`KYB failed: ${JSON.stringify(kybJson)}`);

  // 3) Gemini risk analysis (real)
  const prompt = [
    "You are an RWA compliance risk model.",
    "Return ONLY valid JSON with keys: approved(boolean), riskScore(number 0-1000), reasons(array of strings).",
    "No markdown, no code fences.",
    "",
    "Input:",
    JSON.stringify(
      {
        subject,
        requester,
        docBundleHash,
        metadataUri,
        kyb: kybJson,
      },
      null,
      2
    ),
  ].join("\n");

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    geminiModel
  )}:generateContent?key=${encodeURIComponent(geminiKey)}`;

  const geminiResp = await fetch(geminiEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  const geminiJson = await geminiResp.json();
  if (!geminiResp.ok) throw new Error(`Gemini error: ${JSON.stringify(geminiJson)}`);

  const text =
    geminiJson?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
  let risk;
  try {
    risk = JSON.parse(text);
  } catch {
    throw new Error(`Gemini did not return strict JSON. Got:\n${text}`);
  }

  if (typeof risk?.approved !== "boolean") throw new Error("risk.approved must be boolean");
  if (typeof risk?.riskScore !== "number") throw new Error("risk.riskScore must be number");
  if (!Array.isArray(risk?.reasons)) throw new Error("risk.reasons must be string[]");

  const approved = risk.approved && kybJson.providerStatus === "APPROVED";
  const riskScore = Math.max(0, Math.min(1000, Math.floor(risk.riskScore)));

  const reportJson = JSON.stringify({ ...risk, approved, riskScore });
  const reportHash = sh("cast", ["keccak", reportJson], { silent: true });

  const providerResponseHash = kybJson.providerResponseHash;
  const attestationHash = sh("cast", ["keccak", hexConcat32(docBundleHash, providerResponseHash, reportHash)], {
    silent: true,
  });

  // 4) Write to receiver (no CRE, but same call shape)
  const reportBytes = sh("cast", [
    "abi-encode",
    "f(address,bool,uint32,bytes32)",
    subject,
    String(approved),
    String(riskScore),
    attestationHash,
  ]);

  const tx = sh("cast", [
    "send",
    receiver,
    "onReport(bytes,bytes)",
    "0x",
    reportBytes,
    "--rpc-url",
    rpcUrl,
    "--private-key",
    privateKey,
  ]);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        requestId: Number(requestId),
        subject,
        approved,
        riskScore,
        providerResponseHash,
        reportHash,
        attestationHash,
        tx,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
