import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INBOUND_BODY_STORE_BYTES,
  normalizeToAddresses,
  processResendInboundEmail,
  resolveInboundForwardTo,
  truncateBody,
  type InboundForwardStatus,
} from "./resend-inbound-forward";

// Default for the legacy forward tests below; withEnv overrides per test.
process.env.RESEND_INBOUND_FORWARD_TO = "ops@example.com";

function withEnv(value: string | undefined, fn: () => void | Promise<void>) {
  return async () => {
    const prev = process.env.RESEND_INBOUND_FORWARD_TO;
    if (value === undefined) delete process.env.RESEND_INBOUND_FORWARD_TO;
    else process.env.RESEND_INBOUND_FORWARD_TO = value;
    try {
      await fn();
    } finally {
      if (prev !== undefined) process.env.RESEND_INBOUND_FORWARD_TO = prev;
      else delete process.env.RESEND_INBOUND_FORWARD_TO;
    }
  };
}

test("resolveInboundForwardTo is null when env unset", withEnv(undefined, () => {
  assert.equal(resolveInboundForwardTo(), null);
}));

test("resolveInboundForwardTo trims a valid env value", withEnv(" ops@example.com ", () => {
  assert.equal(resolveInboundForwardTo(), "ops@example.com");
}));

test("resolveInboundForwardTo rejects invalid values and lists", async () => {
  for (const bad of ["nope", "a@b", "a@x.com, b@x.com", "a@x.com;b@x.com", "a b@x.com", "Name <a@x.com>", "   "]) {
    await withEnv(bad, () => {
      assert.equal(resolveInboundForwardTo(), null, bad);
    })();
  }
});

test("normalizeToAddresses accepts string, list, and CSV", () => {
  assert.deepEqual(normalizeToAddresses(["a@x.com", " b@x.com "]), [
    "a@x.com",
    "b@x.com",
  ]);
  assert.deepEqual(normalizeToAddresses("a@x.com, b@x.com"), [
    "a@x.com",
    "b@x.com",
  ]);
  assert.deepEqual(normalizeToAddresses(null), []);
});

test("truncateBody keeps small bodies and caps large ones", () => {
  assert.deepEqual(truncateBody("hi", 10), { text: "hi", truncated: false });
  assert.deepEqual(truncateBody(null), { text: null, truncated: false });
  const big = "x".repeat(INBOUND_BODY_STORE_BYTES + 50);
  const out = truncateBody(big);
  assert.equal(out.truncated, true);
  assert.ok(out.text && Buffer.byteLength(out.text, "utf8") <= INBOUND_BODY_STORE_BYTES);
});

function memoryStore(initialStatus: InboundForwardStatus = "pending") {
  const rows = new Map<
    string,
    { id: string; forward_status: InboundForwardStatus; payload: Record<string, unknown> }
  >();
  const marks: Array<{ id: string; status: InboundForwardStatus; error: string | null }> = [];
  return {
    rows,
    marks,
    store: {
      async upsertInbound(row: {
        resend_email_id: string;
        [key: string]: unknown;
      }) {
        const existing = rows.get(row.resend_email_id);
        if (existing) {
          existing.payload = row;
          return { id: existing.id, forward_status: existing.forward_status };
        }
        const id = `row-${rows.size + 1}`;
        rows.set(row.resend_email_id, {
          id,
          forward_status: initialStatus,
          payload: row,
        });
        return { id, forward_status: initialStatus };
      },
      async markForward(id: string, status: InboundForwardStatus, error: string | null) {
        marks.push({ id, status, error });
        for (const row of rows.values()) {
          if (row.id === id) row.forward_status = status;
        }
      },
    },
  };
}

test("processResendInboundEmail stores before forward and survives forward failure", async () => {
  const mem = memoryStore("pending");
  let sendCalls = 0;
  const result = await processResendInboundEmail(
    {
      type: "email.received",
      data: { email_id: "re_in_1", from: "a@ex.com", to: "hello@tulala.digital" },
    },
    {
      store: mem.store,
      fetchInbound: async () => ({
        data: {
          from: "a@ex.com",
          to: ["hello@tulala.digital"],
          subject: "Need help",
          text: "Body text",
          html: "<p>Body</p>",
          message_id: "<mid@ex.com>",
        },
        error: null,
      }),
      sendForward: async () => {
        sendCalls += 1;
        return { status: "failed", error: "smtp down" };
      },
    },
  );

  assert.equal(result.stored, true);
  assert.equal(result.ok, true);
  assert.equal(result.forwardStatus, "failed");
  assert.equal(sendCalls, 1);
  assert.equal(mem.rows.size, 1);
  const stored = mem.rows.get("re_in_1");
  assert.ok(stored);
  assert.equal(stored.payload.subject, "Need help");
  assert.equal(stored.payload.body_text, "Body text");
  assert.deepEqual(mem.marks, [
    { id: "row-1", status: "failed", error: "smtp down" },
  ]);
});

test("processResendInboundEmail marks sent when forward succeeds", async () => {
  const mem = memoryStore("pending");
  const result = await processResendInboundEmail(
    { type: "email.received", data: { email_id: "re_in_2" } },
    {
      store: mem.store,
      fetchInbound: async () => ({
        data: {
          from: "b@ex.com",
          to: "support@tulala.digital",
          subject: "Hi",
          text: "x",
          html: null,
        },
        error: null,
      }),
      sendForward: async () => ({ status: "sent", id: "out_1", from: "Tulala <noreply@tulala.digital>" }),
    },
  );
  assert.equal(result.stored, true);
  assert.equal(result.forwardStatus, "sent");
  assert.equal(mem.marks[0]?.status, "sent");
});

test("processResendInboundEmail does not re-forward when already sent", async () => {
  const mem = memoryStore("sent");
  let sendCalls = 0;
  const result = await processResendInboundEmail(
    { type: "email.received", data: { email_id: "re_in_3" } },
    {
      store: mem.store,
      fetchInbound: async () => ({
        data: { from: "c@ex.com", to: "hello@tulala.digital", subject: "Again", text: "y" },
        error: null,
      }),
      sendForward: async () => {
        sendCalls += 1;
        return { status: "sent", id: "x", from: "Tulala <noreply@tulala.digital>" };
      },
    },
  );
  assert.equal(result.stored, true);
  assert.equal(result.forwardStatus, "sent");
  assert.equal(sendCalls, 0);
  assert.match(result.detail, /already stored/);
});

test("processResendInboundEmail fails closed when store is unavailable", async () => {
  const result = await processResendInboundEmail(
    { type: "email.received", data: { email_id: "re_in_4" } },
    {
      store: null,
      fetchInbound: async () => ({
        data: { from: "d@ex.com", to: "hello@tulala.digital", subject: "Z", text: "z" },
        error: null,
      }),
      sendForward: async () => ({ status: "sent", id: "x", from: "Tulala <noreply@tulala.digital>" }),
    },
  );
  assert.equal(result.stored, false);
  assert.equal(result.ok, false);
  assert.match(result.detail, /store unavailable/);
});

const inboundData = {
  data: { from: "z@ex.com", to: "hello@tulala.digital", subject: "S", text: "t", html: null },
  error: null,
};
const sentOk = { status: "sent" as const, id: "x", from: "Tulala <noreply@tulala.digital>" };

test("unset env: stored, marked skipped, send NOT called", withEnv(undefined, async () => {
  const mem = memoryStore("pending");
  let sendCalls = 0;
  const result = await processResendInboundEmail(
    { type: "email.received", data: { email_id: "re_in_5" } },
    {
      store: mem.store,
      fetchInbound: async () => inboundData,
      sendForward: async () => {
        sendCalls += 1;
        return sentOk;
      },
    },
  );
  assert.equal(result.stored, true);
  assert.equal(result.ok, true);
  assert.equal(result.forwardStatus, "skipped");
  assert.equal(sendCalls, 0);
  assert.equal(mem.rows.get("re_in_5")?.payload.forward_to, null);
  assert.equal(mem.marks[0]?.status, "skipped");
  assert.match(mem.marks[0]?.error ?? "", /RESEND_INBOUND_FORWARD_TO/);
}));

test("invalid env: stored, skipped, send NOT called", withEnv("a@x.com, b@x.com", async () => {
  const mem = memoryStore("pending");
  let sendCalls = 0;
  const result = await processResendInboundEmail(
    { type: "email.received", data: { email_id: "re_in_6" } },
    {
      store: mem.store,
      fetchInbound: async () => inboundData,
      sendForward: async () => {
        sendCalls += 1;
        return sentOk;
      },
    },
  );
  assert.equal(result.forwardStatus, "skipped");
  assert.equal(sendCalls, 0);
}));

test("valid env: forwards to that address and marks sent", withEnv("ops@example.com", async () => {
  const mem = memoryStore("pending");
  let sentTo: unknown = null;
  const result = await processResendInboundEmail(
    { type: "email.received", data: { email_id: "re_in_7" } },
    {
      store: mem.store,
      fetchInbound: async () => inboundData,
      sendForward: async (args) => {
        sentTo = args.to;
        return sentOk;
      },
    },
  );
  assert.equal(result.forwardStatus, "sent");
  assert.equal(sentTo, "ops@example.com");
  assert.equal(mem.rows.get("re_in_7")?.payload.forward_to, "ops@example.com");
}));
