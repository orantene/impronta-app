import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { backfillTenant, type BackfillClient } from "./backfill.js";
import { db } from "./db.js";
import { decryptSession, encryptSession } from "./crypto.js";
import { relayMessage, type RelayMessage } from "./relay.js";
import { postWebhook } from "./webhook-client.js";

type ClientHandle = {
  send: (to: string, body: string) => Promise<string>;
  logout: () => Promise<void>;
  requestPairingCode?: (phone: string) => Promise<string>;
  backfill?: (options?: { force?: boolean }) => Promise<number>;
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
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "session.json"), decryptSession(Buffer.from(b64, "base64")));
  } catch (err) {
    // Wrong CHANNEL_SESSION_KEY or corrupt blob: start a fresh QR pair.
    console.warn("[channel-worker] session restore skipped", tenantId, err);
  }
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

  // CJS package: Client is named, LocalAuth lives on default under Node ESM.
  const wweb = await import("whatsapp-web.js");
  const Client = wweb.Client;
  const LocalAuth = (wweb as { default?: { LocalAuth?: unknown } }).default?.LocalAuth ??
    (wweb as { LocalAuth?: unknown }).LocalAuth;
  if (typeof Client !== "function" || typeof LocalAuth !== "function") {
    throw new Error("whatsapp-web.js LocalAuth unavailable");
  }
  const dir = join(tmpdir(), "tulala-wwebjs", tenantId);
  await mkdir(dir, { recursive: true });
  await restoreSession(tenantId, dir);

  const client = new Client({
    authStrategy: new (LocalAuth as new (opts: { dataPath: string; clientId: string }) => unknown)({
      dataPath: dir,
      clientId: tenantId,
    }),
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
    // Not awaited: the walk takes minutes on a busy account and `ready` must
    // return so the session can serve live events while history streams in.
    void backfillTenant(tenantId, client as unknown as BackfillClient).catch(() => {});
  });
  client.on("disconnected", async () => {
    pages.delete(tenantId);
    await postWebhook({ kind: "session", tenantId, state: "unlinked" });
    clients.delete(tenantId);
  });
  client.on("message", async (msg: RelayMessage) => {
    await relayMessage({ tenantId, chatId: msg.from, message: msg, withMedia: true });
  });
  // What the owner types on the phone itself. Without this the drawer showed
  // the customer's half of the conversation and the app's own replies, but
  // never the replies tapped out in WhatsApp — a thread with holes in it.
  // `message_create` fires for both directions, so inbound is left to the
  // `message` handler above rather than relayed twice.
  client.on("message_create", async (msg: RelayMessage) => {
    if (!msg.fromMe) return;
    const chatId = msg.to ?? msg.from;
    await relayMessage({ tenantId, chatId, message: msg, withMedia: true });
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
    backfill: async (options) =>
      backfillTenant(tenantId, client as unknown as BackfillClient, options),
  });
}

/** Re-run the history import without re-pairing. Served by POST /backfill. */
export async function backfillTenantMessages(tenantId: string): Promise<number> {
  const handle = clients.get(tenantId);
  if (!handle?.backfill) throw new Error("not_connected");
  return handle.backfill({ force: true });
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
