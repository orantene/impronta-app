import assert from "node:assert/strict";
import { test } from "node:test";

import { handleWhatsAppWebhook } from "./webhook-handler";

type Row = Record<string, unknown>;

function mockAdmin(seed?: { connections?: Row[]; inquiries?: Row[]; deliveries?: Row[] }) {
  const connections = [...(seed?.connections ?? [])];
  const inquiries = [...(seed?.inquiries ?? [])];
  const messages: Row[] = [];
  const deliveries = [...(seed?.deliveries ?? [])];
  const updates: { table: string; patch: Row }[] = [];

  function table(name: string) {
    const q: {
      filters: Array<{ k: string; v: unknown }>;
      payload: Row | null;
      op: "select" | "insert" | "update" | "upsert";
    } = { filters: [], payload: null, op: "select" };
    const api = {
      select() {
        return api;
      },
      insert(payload: Row) {
        q.op = "insert";
        q.payload = payload;
        return api;
      },
      update(payload: Row) {
        q.op = "update";
        q.payload = payload;
        return api;
      },
      upsert(payload: Row) {
        q.op = "upsert";
        q.payload = payload;
        return api;
      },
      eq(k: string, v: unknown) {
        q.filters.push({ k, v });
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle: async () => {
        const rows = rowsFor(name);
        const found = rows.find((row) => q.filters.every((f) => row[f.k] === f.v)) ?? null;
        return { data: found, error: null };
      },
      single: async () => {
        if (q.op === "insert" && q.payload) {
          const row = { id: `${name}-${rowsFor(name).length + 1}`, ...q.payload };
          rowsFor(name).push(row);
          return { data: row, error: null };
        }
        if (q.op === "upsert" && q.payload) {
          rowsFor(name).push({ id: `${name}-up`, ...q.payload });
          return { data: { id: `${name}-up` }, error: null };
        }
        return { data: null, error: { message: "missing" } };
      },
      then: undefined as undefined,
    };
    if (q.op === "update") {
      Object.assign(api, {
        eq(k: string, v: unknown) {
          q.filters.push({ k, v });
          return api;
        },
      });
    }
    const origUpdate = api.update;
    api.update = (payload: Row) => {
      updates.push({ table: name, patch: payload });
      return origUpdate(payload);
    };
    function rowsFor(tableName: string): Row[] {
      if (tableName === "channel_connections") return connections;
      if (tableName === "inquiries") return inquiries;
      if (tableName === "inquiry_messages") return messages;
      if (tableName === "message_delivery") return deliveries;
      if (tableName === "customers") return [];
      return [];
    }
    return api;
  }

  return {
    from: table,
    updates,
    inquiries,
    messages,
    deliveries,
  };
}

test("legacy webhook body still inserts a text message", async () => {
  const admin = mockAdmin();
  const result = await handleWhatsAppWebhook(admin, {
    inquiryId: "inq-1",
    tenantId: "t1",
    text: "hola",
    providerRef: "p1",
  });
  assert.equal(result.ok, true);
  assert.equal(admin.messages.length, 1);
});

test("inbound message creates an inquiry keyed by chatId and refuses a foreign tenant", async () => {
  const foreign = mockAdmin({ connections: [] });
  const denied = await handleWhatsAppWebhook(foreign, {
    kind: "message",
    tenantId: "t1",
    chatId: "5219981234471@c.us",
    from: "+5219981234471",
    pushName: "Marco",
    providerRef: "wamid.1",
    text: "hola",
    fromMe: false,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.reason, "wrong_tenant");

  const admin = mockAdmin({
    connections: [{ tenant_id: "t1", channel: "whatsapp", phone_e164: "+5219981230100" }],
  });
  const created = await handleWhatsAppWebhook(admin, {
    kind: "message",
    tenantId: "t1",
    chatId: "5219981234471@c.us",
    from: "+5219981234471",
    pushName: "Marco",
    providerRef: "wamid.1",
    text: "hola",
    fromMe: false,
  });
  assert.equal(created.ok, true);
  assert.equal(admin.inquiries[0]?.channel, "whatsapp");
  assert.equal(admin.inquiries[0]?.external_thread_ref, "whatsapp:5219981234471@c.us");
  assert.equal(admin.inquiries[0]?.conversation_state, "needs_reply");
});

test("fromMe to an unknown chat is ignored; known chat is stored as via phone", async () => {
  const admin = mockAdmin({
    connections: [{ tenant_id: "t1", channel: "whatsapp", phone_e164: "+5219981230100" }],
  });
  const ignored = await handleWhatsAppWebhook(admin, {
    kind: "message",
    tenantId: "t1",
    chatId: "5210000000000@c.us",
    from: "+5210000000000",
    providerRef: "wamid.me",
    text: "from the phone",
    fromMe: true,
  });
  assert.equal(ignored.ok, true);
  assert.equal(admin.messages.length, 0);

  admin.inquiries.push({
    id: "inq-known",
    tenant_id: "t1",
    external_thread_ref: "whatsapp:5219981234471@c.us",
  });
  const stored = await handleWhatsAppWebhook(admin, {
    kind: "message",
    tenantId: "t1",
    chatId: "5219981234471@c.us",
    from: "+5219981234471",
    providerRef: "wamid.me2",
    text: "from the phone",
    fromMe: true,
  });
  assert.equal(stored.ok, true);
  assert.deepEqual(admin.messages.at(-1)?.card_payload, { via: "phone" });
});

test("session webhook writes pairing and clears ciphertext on unlink", async () => {
  const admin = mockAdmin();
  const pairing = await handleWhatsAppWebhook(admin, {
    kind: "session",
    tenantId: "t1",
    state: "pairing",
    qr: "qr-payload",
  });
  assert.equal(pairing.ok, true);
  const unlinked = await handleWhatsAppWebhook(admin, {
    kind: "session",
    tenantId: "t1",
    state: "unlinked",
  });
  assert.equal(unlinked.ok, true);
});

test("ack updates delivery by providerRef", async () => {
  const admin = mockAdmin({
    deliveries: [{ id: "d1", tenant_id: "t1", channel: "whatsapp", provider_ref: "wamid.9", state: "sent" }],
  });
  const result = await handleWhatsAppWebhook(admin, {
    kind: "ack",
    tenantId: "t1",
    providerRef: "wamid.9",
    state: "read",
  });
  assert.equal(result.ok, true);
});
