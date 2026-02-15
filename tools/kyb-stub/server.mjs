import http from "node:http";
import crypto from "node:crypto";

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

// This is intentionally a "mock provider" for now (per request).
// Swap this out later for a real KYB/KYC provider API (Sumsub/Persona/Onfido/etc.).
function verify({ subject, docBundleHash, metadataUri }) {
  if (!subject || typeof subject !== "string") {
    return { ok: false, reason: "missing subject" };
  }
  if (!docBundleHash || typeof docBundleHash !== "string") {
    return { ok: false, reason: "missing docBundleHash" };
  }

  const normalized = JSON.stringify({
    subject: subject.toLowerCase(),
    docBundleHash: docBundleHash.toLowerCase(),
    metadataUri: metadataUri ?? "",
  });

  const providerResponseHash = "0x" + crypto.createHash("sha256").update(normalized).digest("hex");

  // Simple deterministic decision rule:
  // - require ipfs:// metadata
  // - require non-zero doc hash
  const metadataOk = typeof metadataUri === "string" && metadataUri.startsWith("ipfs://");
  const hashOk =
    docBundleHash.startsWith("0x") &&
    docBundleHash.length === 66 &&
    docBundleHash !== "0x" + "0".repeat(64);

  const approved = metadataOk && hashOk;
  const providerScore = approved ? 10 : 900; // 0..1000

  return {
    ok: true,
    providerStatus: approved ? "APPROVED" : "REJECTED",
    providerScore,
    providerResponseHash,
    reasons: [
      ...(metadataOk ? [] : ["metadataUri must start with ipfs://"]),
      ...(hashOk ? [] : ["docBundleHash must be 32-byte non-zero hex"]),
    ],
  };
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/kyb") {
      const body = await readJson(req);
      const result = verify(body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: String(e?.message ?? e) });
  }
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`KYB stub listening on http://${host}:${port}`);
});
