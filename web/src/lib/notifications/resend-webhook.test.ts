import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  applyResendEvent,
  bounceDetailColumns,
  verifyResendSignature,
  suppressionReasonFor,
  type ResendWebhookEvent,
} from "./resend-webhook";

// ─── Signature verification (Svix scheme) ─────────────────────────────────────

/** Re-sign helper for fresh-timestamp cases (mirrors the production format). */
function sign(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return "v1," + createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

test("verifyResendSignature accepts the canonical Svix vector", () => {
  // Official Svix verification vector — proves the FULL pipeline end to end:
  // whsec_ strip + base64 secret decode, "id.timestamp.body" signed content,
  // HMAC-SHA256 → base64, "v1,<sig>" header parsing. Pin the clock so the
  // 2021 timestamp passes the freshness window.
  const realNow = Date.now;
  Date.now = () => 1614265330 * 1000;
  try {
    assert.equal(
      verifyResendSignature(SECRET, '{"test": 2432232314}', {
        id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
        timestamp: "1614265330",
        signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
      }),
      true,
    );
  } finally {
    Date.now = realNow;
  }
});

test("verifyResendSignature: fresh valid signature passes", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"email.delivered","data":{"email_id":"re_abc"}}';
  const signature = sign(SECRET, "msg_1", ts, body);
  assert.equal(verifyResendSignature(SECRET, body, { id: "msg_1", timestamp: ts, signature }), true);
});

test("verifyResendSignature: tampered body fails", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"email.delivered"}';
  const signature = sign(SECRET, "msg_1", ts, body);
  assert.equal(
    verifyResendSignature(SECRET, '{"type":"email.complained"}', { id: "msg_1", timestamp: ts, signature }),
    false,
  );
});

test("verifyResendSignature: wrong secret fails", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = "{}";
  const signature = sign(SECRET, "msg_1", ts, body);
  assert.equal(
    verifyResendSignature("whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", body, {
      id: "msg_1",
      timestamp: ts,
      signature,
    }),
    false,
  );
});

test("verifyResendSignature: stale timestamp fails (replay window)", () => {
  const staleTs = String(Math.floor(Date.now() / 1000) - 10 * 60);
  const body = "{}";
  const signature = sign(SECRET, "msg_1", staleTs, body);
  assert.equal(
    verifyResendSignature(SECRET, body, { id: "msg_1", timestamp: staleTs, signature }),
    false,
  );
});

test("verifyResendSignature: missing headers fail", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = sign(SECRET, "msg_1", ts, "{}");
  assert.equal(verifyResendSignature(SECRET, "{}", { id: null, timestamp: ts, signature }), false);
  assert.equal(verifyResendSignature(SECRET, "{}", { id: "msg_1", timestamp: null, signature }), false);
  assert.equal(verifyResendSignature(SECRET, "{}", { id: "msg_1", timestamp: ts, signature: null }), false);
  assert.equal(verifyResendSignature("", "{}", { id: "msg_1", timestamp: ts, signature }), false);
});

test("verifyResendSignature: matches one of several space-delimited sigs", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = "{}";
  const good = sign(SECRET, "msg_1", ts, body);
  const header = `v1,AAAAdecoyAAAA ${good} v2,ignored`;
  assert.equal(verifyResendSignature(SECRET, body, { id: "msg_1", timestamp: ts, signature: header }), true);
});

// ─── Suppression classification (conservative) ────────────────────────────────

function evt(type: string, bounce?: { type?: string }): ResendWebhookEvent {
  return { type, data: bounce ? { bounce } : {} };
}

test("suppressionReasonFor: complaints always suppress", () => {
  assert.equal(suppressionReasonFor(evt("email.complained")), "complaint");
});

test("suppressionReasonFor: permanent bounces suppress", () => {
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "Permanent" })), "hard_bounce");
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "permanent" })), "hard_bounce");
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "hard" })), "hard_bounce");
});

test("suppressionReasonFor: transient/undetermined/shape-less bounces do NOT suppress", () => {
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "Transient" })), null);
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "Undetermined" })), null);
  assert.equal(suppressionReasonFor(evt("email.bounced")), null);
});

test("suppressionReasonFor: non-suppressing events return null", () => {
  assert.equal(suppressionReasonFor(evt("email.delivered")), null);
  assert.equal(suppressionReasonFor(evt("email.opened")), null);
  assert.equal(suppressionReasonFor(evt("email.clicked")), null);
});

// ─── applyResendEvent — the suppression WRITE path ──────────────────────────
//
// suppressionReasonFor above is pure and was always correct. The bug lived one
// layer down, in applyResendEvent, which required a user_id before it would
// write a suppression. Guest support and invitees are mailed with no account,
// so their hard bounces stamped bounced_at and suppressed nothing, and the dead
// address kept being mailed. Observed in production: 5 hard bounces, 0
// suppressions. Nothing tested this path, which is why a correct classifier and
// a green suite coexisted with a feature that did not work.

type UpsertCall = { row: Record<string, unknown>; opts: Record<string, unknown> };

/**
 * Minimal Supabase stub covering the three chains applyResendEvent uses:
 * dispatch_log update→eq→select, dispatch_log select→…→maybeSingle, and
 * email_suppressions upsert.
 */
function stubAdmin(opts: {
  stampRows?: Array<{ recipient_user_id: string | null; tenant_id: string | null }>;
  resolvedUserId?: string | null;
  upserts: UpsertCall[];
  /** Captures every column payload sent to .update(), for the bounce-detail tests. */
  updates?: Array<Record<string, unknown>>;
}) {
  const chain = (table: string): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    const ret = () => self;
    for (const m of ["eq", "not", "ilike", "order", "limit", "select", "update"]) {
      self[m] = (..._a: unknown[]) => {
        if (m === "select" && table === "notification_dispatch_log" && self.__isUpdate) {
          return Promise.resolve({ data: opts.stampRows ?? [], error: null });
        }
        return ret();
      };
    }
    self.update = (row: Record<string, unknown>) => {
      self.__isUpdate = true;
      opts.updates?.push(row);
      return self;
    };
    self.maybeSingle = () =>
      Promise.resolve({
        data: opts.resolvedUserId ? { recipient_user_id: opts.resolvedUserId } : null,
        error: null,
      });
    self.upsert = (row: Record<string, unknown>, o: Record<string, unknown>) => {
      opts.upserts.push({ row, opts: o });
      return Promise.resolve({ error: null });
    };
    return self;
  };
  return { from: (t: string) => chain(t) } as unknown as Parameters<typeof applyResendEvent>[0];
}

const hardBounce = (to: string) => ({
  type: "email.bounced",
  data: { email_id: "re_abc123", to, bounce: { type: "Permanent" } },
});

test("applyResendEvent suppresses a hard bounce for a GUEST with no account", async () => {
  const upserts: UpsertCall[] = [];
  // No dispatch_log user (guest send) and no account at that address.
  const admin = stubAdmin({
    stampRows: [{ recipient_user_id: null, tenant_id: null }],
    resolvedUserId: null,
    upserts,
  });

  const res = await applyResendEvent(admin, hardBounce("guest.person@example.com"));

  assert.equal(res.status, "suppressed", `expected suppressed, got ${res.status}: ${res.detail}`);
  assert.equal(upserts.length, 1, "no suppression row was written for a guest hard bounce");
  assert.equal(upserts[0].row.user_id, null);
  assert.equal(upserts[0].row.email_address, "guest.person@example.com");
  assert.equal(upserts[0].row.reason, "hard_bounce");
  // NULLs compare as distinct, so the (user_id, email_address) constraint
  // cannot dedupe a user-less row — Resend retries would insert duplicates.
  assert.equal(upserts[0].opts.onConflict, "email_address");
});

test("applyResendEvent still keys a known user's suppression on (user_id, email)", async () => {
  const upserts: UpsertCall[] = [];
  const admin = stubAdmin({
    stampRows: [{ recipient_user_id: "user-1", tenant_id: "tenant-1" }],
    upserts,
  });

  const res = await applyResendEvent(admin, hardBounce("member@example.com"));

  assert.equal(res.status, "suppressed");
  assert.equal(upserts[0].row.user_id, "user-1");
  assert.equal(upserts[0].opts.onConflict, "user_id,email_address");
});

test("applyResendEvent does not suppress a transient bounce", async () => {
  const upserts: UpsertCall[] = [];
  const admin = stubAdmin({ stampRows: [], upserts });
  const res = await applyResendEvent(admin, {
    type: "email.bounced",
    data: { email_id: "re_x", to: "someone@example.com", bounce: { type: "Transient" } },
  });
  assert.equal(res.status, "stamped");
  assert.equal(upserts.length, 0, "a transient bounce must never suppress");
});

test("applyResendEvent cannot suppress without an address", async () => {
  const upserts: UpsertCall[] = [];
  const admin = stubAdmin({ stampRows: [], upserts });
  const res = await applyResendEvent(admin, {
    type: "email.bounced",
    data: { email_id: "re_y", bounce: { type: "Permanent" } },
  });
  assert.equal(res.status, "unmatched");
  assert.equal(upserts.length, 0);
});

// ─── Bounce detail is observable ──────────────────────────────────────────────
//
// Suppression has written zero rows in production across every bounce we have
// ever received. The first blocker (guest bounces dropped for having no user
// id) was fixed and did not fix this: a bounce on 2026-09-03 with a valid user
// id still suppressed nothing. The classifier only fires on a Permanent bounce,
// and until these columns existed there was no way to know whether Resend has
// ever told us a bounce was permanent — the payload was read once and dropped.
//
// So these tests pin the observability, not a new rule. The rule stays strict
// on purpose: suppressing a live customer over a transient blip is the worse
// error, and guessing our way out of this twice is enough.

test("a bounce records the provider's own classification alongside the stamp", async () => {
  const updates: Array<Record<string, unknown>> = [];
  await applyResendEvent(stubAdmin({ stampRows: [], upserts: [], updates }), {
    type: "email.bounced",
    data: {
      email_id: "re_obs",
      to: "someone@example.com",
      bounce: { type: "Transient", subType: "General", message: "mailbox is full" },
    },
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].bounce_type, "Transient");
  assert.equal(updates[0].bounce_subtype, "General");
  assert.equal(updates[0].bounce_message, "mailbox is full");
  assert.ok(updates[0].bounced_at, "the delivery stamp still happens");
});

test("bounce columns are absent, not null, when the provider sends no detail", () => {
  // A shape-less bounce is itself the finding — writing nulls would erase the
  // difference between "provider said nothing" and "we never looked".
  assert.deepEqual(bounceDetailColumns({ type: "email.bounced", data: { email_id: "x" } }), {});
});

test("non-bounce events write no bounce columns", () => {
  for (const type of ["email.delivered", "email.opened", "email.clicked", "email.complained"]) {
    assert.deepEqual(
      bounceDetailColumns({ type, data: { bounce: { type: "Permanent" } } }),
      {},
      `${type} must not be recorded as a bounce`,
    );
  }
});

test("a long provider message is truncated rather than stored unbounded", () => {
  const detail = bounceDetailColumns({
    type: "email.bounced",
    data: { bounce: { type: "Permanent", message: "x".repeat(5000) } },
  });
  assert.equal((detail.bounce_message as string).length, 500);
});

test("a bounce that did NOT suppress says so in its log detail", async () => {
  const res = await applyResendEvent(stubAdmin({ stampRows: [], upserts: [] }), {
    type: "email.bounced",
    data: { email_id: "re_q", to: "someone@example.com", bounce: { type: "Transient" } },
  });
  assert.equal(res.status, "stamped");
  assert.match(res.detail, /bounce-type=Transient/);
});

test("a bounce with no type at all is logged as absent, not as a missing field", async () => {
  const res = await applyResendEvent(stubAdmin({ stampRows: [], upserts: [] }), {
    type: "email.bounced",
    data: { email_id: "re_r", to: "someone@example.com" },
  });
  assert.match(res.detail, /bounce-type=absent/);
});
