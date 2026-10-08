import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  appendInboundReplyToTicket,
  appendInboundSupportReply,
  type AppendDeps,
  type InboundRow,
  type InboundTicket,
} from "./support-inbound-append.server";
import { ticketToken } from "./support-inbound-match";

const SECRET = "test-secret-not-real";
const ID = "3f2c5ee9-7438-4190-8ae8-adb6a457ec79";

function makeDeps(over: Partial<AppendDeps> = {}, ticket: Partial<InboundTicket> = {}) {
  const messages = new Map<string, { id: string; body: string; meta: Record<string, unknown> }>();
  const row: InboundRow = {
    from_address: "Jane <jane@example.com>",
    to_addresses: [`support+${ticketToken(ID, SECRET)}@in.example.com`],
    subject: "Re: Help [Tulala #12]",
    body_text: "Thanks!\n\nOn Tue, Oct 6, 2026 at 9:14 AM Support <s@in.example.com> wrote:\n> hi",
    body_html: null,
  };
  const t: InboundTicket = {
    id: ID, status: "open", requesterUserId: "user-1", contactEmail: null, ...ticket,
  };
  const deps: AppendDeps = {
    secret: SECRET,
    loadInboundRow: async () => row,
    fetchHeaders: async () => ({ "Auto-Submitted": "no" }),
    loadTicket: async (id) => (id === ID ? t : null),
    loadOwnerEmail: async () => "jane@example.com",
    findExisting: async (_t, key) => messages.get(key) ?? null,
    append: async (i) => {
      const id = `msg-${messages.size + 1}`;
      messages.set(i.clientSendKey, { id, body: i.body, meta: i.extraMetadata });
      return { ok: true, messageId: id };
    },
    ...over,
  };
  return { deps, messages, row };
}

test("appends a sanitized reply with channel=email", async () => {
  const { deps, messages } = makeDeps();
  const r = await appendInboundReplyToTicket("em_1", deps);
  assert.equal(r.outcome, "appended");
  const m = messages.get("email:em_1");
  assert.equal(m?.body, "Thanks!");
  assert.deepEqual(m?.meta, { channel: "email", resend_email_id: "em_1" });
});

test("duplicate delivery appends once", async () => {
  const { deps, messages } = makeDeps();
  const a = await appendInboundReplyToTicket("em_1", deps);
  const b = await appendInboundReplyToTicket("em_1", deps);
  assert.equal(a.outcome, "appended");
  assert.equal(b.outcome, "duplicate");
  assert.equal(messages.size, 1);
});

test("wrong sender is rejected and nothing is appended", async () => {
  const { deps, messages } = makeDeps({ loadOwnerEmail: async () => "someone-else@example.com" });
  const r = await appendInboundReplyToTicket("em_1", deps);
  assert.deepEqual(r, { outcome: "rejected", reason: "sender_not_owner", ticketId: ID });
  assert.equal(messages.size, 0);
});

test("auto-reply is ignored", async () => {
  const { deps, messages } = makeDeps({ fetchHeaders: async () => ({ "Auto-Submitted": "auto-replied" }) });
  const r = await appendInboundReplyToTicket("em_1", deps);
  assert.equal(r.outcome, "rejected");
  assert.equal(messages.size, 0);
});

test("unmatched address stays unmatched", async () => {
  const { deps, row, messages } = makeDeps();
  row.to_addresses = ["help@in.example.com"];
  const r = await appendInboundReplyToTicket("em_1", deps);
  assert.deepEqual(r, { outcome: "unmatched", reason: "no_token" });
  assert.equal(messages.size, 0);
});

test("matches by In-Reply-To header when the To has no token", async () => {
  const t = ticketToken(ID, SECRET);
  const { deps, row } = makeDeps({
    fetchHeaders: async () => ({ "In-Reply-To": `<tulala-support-${t}.x@in.example.com>` }),
  });
  row.to_addresses = ["help@in.example.com"];
  assert.equal((await appendInboundReplyToTicket("em_1", deps)).outcome, "appended");
});

test("closed ticket is not appended; resolved is passed to the engine (which reopens)", async () => {
  const closed = makeDeps({}, { status: "closed" });
  assert.equal((await appendInboundReplyToTicket("em_1", closed.deps)).outcome, "rejected");
  const resolved = makeDeps({}, { status: "resolved" });
  assert.equal((await appendInboundReplyToTicket("em_1", resolved.deps)).outcome, "appended");
});

test("missing headers fail closed; missing secret is unmatched", async () => {
  const noHeaders = makeDeps({ fetchHeaders: async () => null });
  assert.deepEqual(await appendInboundReplyToTicket("em_1", noHeaders.deps), {
    outcome: "error", reason: "headers_unavailable",
  });
  const noSecret = makeDeps({ secret: null });
  assert.equal((await appendInboundReplyToTicket("em_1", noSecret.deps)).outcome, "unmatched");
});

test("never throws: a throwing dependency becomes an error outcome", async () => {
  const { deps } = makeDeps({
    append: async () => {
      throw new Error("db down");
    },
  });
  const r = await appendInboundReplyToTicket("em_1", deps);
  assert.deepEqual(r, { outcome: "error", reason: "exception" });
});

test("route hook resolves even with no configuration (webhook still 2xx)", async () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  delete process.env.GUEST_COOKIE_SECRET;
  try {
    await assert.doesNotReject(appendInboundSupportReply("em_x"));
    await assert.doesNotReject(appendInboundSupportReply(undefined));
  } finally {
    if (prev !== undefined) process.env.GUEST_COOKIE_SECRET = prev;
  }
});

test("route calls the hook only after the stored check, before the 200", () => {
  const src = readFileSync(
    new URL("../../app/api/webhooks/resend/route.ts", import.meta.url),
    "utf8",
  );
  const storedCheck = src.indexOf("if (!inbound.stored)");
  const hook = src.indexOf("await appendInboundSupportReply(");
  const ok = src.indexOf("return NextResponse.json({ received: true, inbound })");
  assert.ok(storedCheck > 0 && hook > storedCheck && ok > hook);
});

import { inboundThreadingEnabled } from "./support-inbound-append.server";

test("reply threading is inert unless SUPPORT_INBOUND_DOMAIN is set", () => {
  assert.equal(inboundThreadingEnabled({}), false);
  assert.equal(inboundThreadingEnabled({ SUPPORT_INBOUND_DOMAIN: "  " }), false);
  assert.equal(inboundThreadingEnabled({ SUPPORT_INBOUND_DOMAIN: "in.example.com" }), true);
});
