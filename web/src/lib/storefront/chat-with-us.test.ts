import assert from "node:assert/strict";
import { test } from "node:test";

import { actChatWithUsCore, readChatWithUsCore, type ChatWithUsDeps } from "./chat-with-us.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";
import { memoryIdempotentRunner } from "./__fixtures__/memory-runner";

const TENANT = uuid(1);
const GUEST_ROW = uuid(2);
const INQ = uuid(3);

function setup(over: Partial<ChatWithUsDeps> = {}) {
  const { admin, store } = fakeAdmin({
    settings: [
      { tenant_id: TENANT, key: "inquiries_open", value: true },
      { tenant_id: TENANT, key: "agency_whatsapp_number", value: "+52 998 123 4567" },
    ],
    tenant_guest_chat_settings: [{ tenant_id: TENANT, enabled: true, greeting: "Hola, ¿en qué te ayudo?" }],
    inquiries: [],
  });
  const memory = memoryIdempotentRunner();
  const created: unknown[] = [];
  const sent: unknown[] = [];
  const deps: ChatWithUsDeps = {
    admin,
    runner: memory.runner,
    identity: { guestKey: "g", userId: null, email: null, displayName: null },
    guestSessionRowId: GUEST_ROW,
    locale: "en",
    origin: "https://shop.test",
    hostname: "shop.test",
    createInquiry: async (_a, intent, ctx) => {
      created.push({ intent, ctx });
      return { ok: true, inquiryId: INQ, missingInfoFlags: [] };
    },
    sendMessage: async (_a, ctx) => {
      sent.push(ctx);
      return { success: true, data: { messageId: uuid(9) } };
    },
    signThreadToken: (id) => `tok-${id.slice(-4)}`,
    ...over,
  };
  return { deps, store, created, sent };
}

test("read: open when both switches are on; greeting from the tenant unless authored; whatsapp link; no thread yet", async () => {
  const { deps } = setup();
  const r = await readChatWithUsCore(deps, TENANT, { hours: "9-18" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.open, true);
  assert.equal(r.data.greeting, "Hola, ¿en qué te ayudo?");
  assert.equal(r.data.hours, "9-18");
  assert.deepEqual(r.data.channels, { thread: true, whatsappUrl: "https://wa.me/529981234567" });
  assert.equal(r.data.existing, null);
  const authored = await readChatWithUsCore(deps, TENANT, { greeting: "Hi!", channels: ["thread"] });
  assert.ok(authored.ok && authored.data.greeting === "Hi!" && authored.data.channels.whatsappUrl === null);
});

test("read: inquiries closed or chat disabled → not open; this browser's latest thread is linked", async () => {
  const { deps, store } = setup();
  store.settings![0]!.value = false;
  const closed = await readChatWithUsCore(deps, TENANT, {});
  assert.ok(closed.ok && closed.data.open === false && closed.data.channels.thread === false);
  store.settings![0]!.value = true;
  store.tenant_guest_chat_settings![0]!.enabled = false;
  const off = await readChatWithUsCore(deps, TENANT, {});
  assert.ok(off.ok && off.data.open === false);
  store.tenant_guest_chat_settings![0]!.enabled = true;
  store.inquiries!.push(
    { id: uuid(30), tenant_id: TENANT, status: "submitted", created_at: "2026-09-01T00:00:00Z", guest_session_id: GUEST_ROW, client_user_id: null },
    { id: INQ, tenant_id: TENANT, status: "in_review", created_at: "2026-09-10T00:00:00Z", guest_session_id: GUEST_ROW, client_user_id: null },
    { id: uuid(31), tenant_id: TENANT, status: "submitted", created_at: "2026-09-12T00:00:00Z", guest_session_id: uuid(99), client_user_id: null },
  );
  const r = await readChatWithUsCore(deps, TENANT, {});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.existing, {
    inquiryId: INQ,
    status: "in_review",
    threadUrl: `https://shop.test/c/t/tok-${INQ.slice(-4)}`,
    startedAtIso: "2026-09-10T00:00:00.000Z",
  });
});

const INPUT = { tenantId: TENANT, contact: { name: "Ana", email: "Ana@Example.com" }, message: "Do you do walk-ins?", clientKey: "chat-0001-aaaa", sourcePage: "/" };

test("act: refuses without a name and a way to answer; refuses with no session at all", async () => {
  const { deps, created } = setup();
  const noName = await actChatWithUsCore(deps, { ...INPUT, contact: { name: "", email: "a@b.co" } });
  assert.ok(!noName.ok && noName.reason === "identity_required");
  const noWay = await actChatWithUsCore(deps, { ...INPUT, contact: { name: "Ana" } });
  assert.ok(!noWay.ok && noWay.reason === "identity_required");
  const noSession = await actChatWithUsCore({ ...deps, guestSessionRowId: null }, INPUT);
  assert.ok(!noSession.ok && noSession.reason === "identity_required");
  const empty = await actChatWithUsCore(deps, { ...INPUT, message: "   " });
  assert.ok(!empty.ok && empty.reason === "refused" && empty.code === "invalid_request");
  assert.equal(created.length, 0);
});

test("act: starts the inquiry as agency_site with the guest session, posts the first message, links the thread; the key replays", async () => {
  const { deps, created, sent } = setup();
  const r = await actChatWithUsCore(deps, INPUT);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.inquiryId, INQ);
  assert.equal(r.messageId, uuid(9));
  assert.equal(r.threadPath, `/c/t/tok-${INQ.slice(-4)}`);
  assert.equal(r.threadUrl, `https://shop.test/c/t/tok-${INQ.slice(-4)}`);
  const c = created[0] as { intent: { source: string; requester: { email: string }; brief: { summary: string } }; ctx: { guest_session_id: string; actor_user_id: null } };
  assert.equal(c.intent.source, "agency_site");
  assert.equal(c.intent.requester.email, "ana@example.com");
  assert.equal(c.intent.brief.summary, "Do you do walk-ins?");
  assert.equal(c.ctx.guest_session_id, GUEST_ROW);
  const m = sent[0] as { threadType: string; guestSessionId: string };
  assert.equal(m.threadType, "private");
  assert.equal(m.guestSessionId, GUEST_ROW);
  const again = await actChatWithUsCore(deps, INPUT);
  assert.ok(again.ok && again.replayed === true && again.inquiryId === INQ);
  assert.equal(created.length, 1);
});

test("act: engine refusals — rate_limited and forbidden are refused, validation is invalid; a refused key is retryable", async () => {
  let reason: "rate_limited" | "forbidden" | "validation_failed" | null = "rate_limited";
  const { deps, created } = setup({
    createInquiry: async () => {
      created.push(reason);
      if (reason) return { ok: false, reason };
      return { ok: true, inquiryId: INQ, missingInfoFlags: [] };
    },
  });
  const limited = await actChatWithUsCore(deps, INPUT);
  assert.ok(!limited.ok && limited.reason === "refused" && limited.code === "rate_limited");
  reason = "forbidden";
  const forb = await actChatWithUsCore(deps, INPUT);
  assert.ok(!forb.ok && forb.code === "forbidden");
  reason = "validation_failed";
  const inv = await actChatWithUsCore(deps, INPUT);
  assert.ok(!inv.ok && inv.code === "validation_failed");
  reason = null;
  const ok = await actChatWithUsCore(deps, INPUT);
  assert.ok(ok.ok);
  assert.equal(created.length, 4);
});
