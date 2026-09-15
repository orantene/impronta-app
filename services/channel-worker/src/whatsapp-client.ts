import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { db } from "./db.js";
import { decryptSession, encryptSession } from "./crypto.js";
import { postWebhook } from "./webhook-client.js";

type ClientHandle = {
  send: (to: string, body: string) => Promise<string>;
  logout: () => Promise<void>;
  requestPairingCode?: (phone: string) => Promise<string>;
};

export type WhatsAppPupPage = {
  createCDPSession: () => Promise<unknown>;
};

const clients = new Map<string, ClientHandle>();
const pages = new Map<string, WhatsAppPupPage>();

export function getWhatsAppPage(tenantId: string): WhatsAppPupPage | null {
  return pages.get(tenantId) ?? null;
}

function mockOn(): boolean {
  return process.env.WWEBJS_MOCK === "1";
}

async function persistSession(tenantId: string, dir: string): Promise<void> {
  try {
    const raw = await readFile(join(dir, "session.json"));
    const blob = encryptSession(raw);
    await db()
      .from("channel_connections")
      .update({
        session_ciphertext: blob.toString("base64"),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("channel", "whatsapp");
  } catch {
    /* session file may not exist yet */
  }
}

async function restoreSession(tenantId: string, dir: string): Promise<void> {
  const { data } = await db()
    .from("channel_connections")
    .select("session_ciphertext")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  const b64 = (data as { session_ciphertext?: string | null } | null)?.session_ciphertext;
  if (!b64) return;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "session.json"), decryptSession(Buffer.from(b64, "base64")));
}

async function mockPair(tenantId: string): Promise<void> {
  await postWebhook({
    kind: "session",
    tenantId,
    state: "pairing",
    qr: `mock-qr:${tenantId}:${Date.now()}`,
    pairingCode: null,
  });
}

export async function pairTenant(tenantId: string): Promise<void> {
  if (mockOn()) {
    await mockPair(tenantId);
    clients.set(tenantId, {
      send: async (_to, _body) => `mock:${tenantId}:${Date.now()}`,
      logout: async () => {
        clients.delete(tenantId);
      },
    });
    return;
  }

  const { Client, LocalAuth } = await import("whatsapp-web.js");
  const dir = join(tmpdir(), "tulala-wwebjs", tenantId);
  await mkdir(dir, { recursive: true });
  await restoreSession(tenantId, dir);

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: dir, clientId: tenantId }),
    puppeteer: {
      executablePath: process.env.WWEBJS_CHROME_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", async (qr: string) => {
    await postWebhook({ kind: "session", tenantId, state: "pairing", qr });
  });
  client.on("ready", async () => {
    const info = client.info as { wid?: { user?: string }; pushname?: string };
    await persistSession(tenantId, dir);
    const readyPage = (client as { pupPage?: WhatsAppPupPage }).pupPage;
    if (readyPage) pages.set(tenantId, readyPage);
    await postWebhook({
      kind: "session",
      tenantId,
      state: "connected",
      phone: info.wid?.user ? `+${info.wid.user}` : null,
      displayName: info.pushname ?? null,
    });
  });
  client.on("disconnected", async () => {
    pages.delete(tenantId);
    await postWebhook({ kind: "session", tenantId, state: "unlinked" });
    clients.delete(tenantId);
  });
  client.on("message", async (msg: {
    id: { _serialized: string };
    from: string;
    body: string;
    fromMe: boolean;
    hasMedia: boolean;
    timestamp: number;
    notifyName?: string;
  }) => {
    if (msg.from.endsWith("@g.us") || msg.from === "status@broadcast") return;
    await postWebhook({
      kind: "message",
      tenantId,
      chatId: msg.from,
      from: msg.from,
      pushName: msg.notifyName ?? null,
      providerRef: msg.id._serialized,
      text: msg.body,
      fromMe: msg.fromMe,
      sentAt: new Date((msg.timestamp || Date.now() / 1000) * 1000).toISOString(),
    });
  });

  await client.initialize();
  const livePage = (client as { pupPage?: WhatsAppPupPage }).pupPage;
  if (livePage) pages.set(tenantId, livePage);
  clients.set(tenantId, {
    send: async (to, body) => {
      const chatId = `${to.replace(/\D/g, "")}@c.us`;
      const sent = await client.sendMessage(chatId, body);
      return sent.id._serialized as string;
    },
    logout: async () => {
      await client.logout();
      await rm(dir, { recursive: true, force: true });
      pages.delete(tenantId);
      clients.delete(tenantId);
    },
    requestPairingCode: async (phone: string) => {
      const code = await client.requestPairingCode(phone.replace(/\D/g, ""));
      await postWebhook({
        kind: "session",
        tenantId,
        state: "pairing",
        pairingCode: code,
      });
      return code;
    },
  });
}

export async function logoutTenant(tenantId: string): Promise<void> {
  const handle = clients.get(tenantId);
  if (handle) await handle.logout();
  pages.delete(tenantId);
  await postWebhook({ kind: "session", tenantId, state: "unlinked" });
}

export async function pairingCodeTenant(tenantId: string, phone: string): Promise<void> {
  const handle = clients.get(tenantId);
  if (handle?.requestPairingCode) {
    await handle.requestPairingCode(phone);
    return;
  }
  if (mockOn()) {
    await postWebhook({
      kind: "session",
      tenantId,
      state: "pairing",
      pairingCode: "1234-5678",
    });
    return;
  }
  await pairTenant(tenantId);
  const next = clients.get(tenantId);
  if (next?.requestPairingCode) await next.requestPairingCode(phone);
}

export async function sendWhatsApp(
  tenantId: string,
  to: string,
  body: string,
): Promise<{ ok: true; providerRef: string } | { ok: false; error: string }> {
  const handle = clients.get(tenantId);
  if (!handle) {
    if (mockOn()) {
      return { ok: true, providerRef: `mock:${tenantId}:${Date.now()}` };
    }
    return { ok: false, error: "not_connected" };
  }
  try {
    const providerRef = await handle.send(to, body);
    return { ok: true, providerRef };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}

export async function resumePairedTenants(): Promise<void> {
  const { data } = await db()
    .from("channel_connections")
    .select("tenant_id, state")
    .eq("channel", "whatsapp")
    .in("state", ["connected", "reconnecting", "pairing"]);
  for (const row of (data ?? []) as { tenant_id: string; state: string }[]) {
    try {
      await pairTenant(row.tenant_id);
    } catch {
      await postWebhook({
        kind: "session",
        tenantId: row.tenant_id,
        state: "reconnecting",
        error: "worker_boot_failed",
      });
    }
  }
}
