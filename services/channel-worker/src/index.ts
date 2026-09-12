import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { tickOutbox } from "./outbox.js";
import { logoutTenant, pairingCodeTenant, pairTenant, resumePairedTenants } from "./whatsapp-client.js";

const PORT = Number(process.env.PORT ?? 8788);

function unauthorized(res: ServerResponse) {
  res.writeHead(401, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, reason: "not_allowed" }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function authorized(req: IncomingMessage): boolean {
  const token = process.env.CHANNEL_WORKER_TOKEN;
  if (!token) return false;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${token}`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://worker.local");
  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, mock: process.env.WWEBJS_MOCK === "1" }));
    return;
  }
  if (!authorized(req)) {
    unauthorized(res);
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }
  let body: { tenantId?: string; phone?: string } = {};
  try {
    body = JSON.parse(await readBody(req)) as { tenantId?: string; phone?: string };
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, reason: "invalid" }));
    return;
  }
  if (!body.tenantId) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, reason: "invalid" }));
    return;
  }
  try {
    if (url.pathname === "/pair") await pairTenant(body.tenantId);
    else if (url.pathname === "/logout") await logoutTenant(body.tenantId);
    else if (url.pathname === "/pairing-code") {
      if (!body.phone) throw new Error("phone required");
      await pairingCodeTenant(body.tenantId, body.phone);
    } else {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, reason: "unavailable", error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`[channel-worker] listening on ${PORT} mock=${process.env.WWEBJS_MOCK === "1"}`);
});

void resumePairedTenants().catch((err) => {
  console.error("[channel-worker] resume failed", err);
});

setInterval(() => {
  void tickOutbox().catch((err) => console.error("[channel-worker] outbox", err));
}, 2000);
