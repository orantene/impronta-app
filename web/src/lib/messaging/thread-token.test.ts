import assert from "node:assert/strict";
import { test } from "node:test";

import { issueVisitorCode, publicThreadPath, signThreadToken, verifyThreadToken } from "./thread-token";

test("round-trip token when secret is set", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  const token = signThreadToken("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", 1_000);
  assert.ok(token);
  const verified = verifyThreadToken(token ?? "", 1_000);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.inquiryId, "11111111-1111-4111-8111-111111111111");
  }
  process.env.GUEST_COOKIE_SECRET = prev;
});

test("visitor continuation code is six digits", () => {
  const code = issueVisitorCode();
  assert.match(code, /^[0-9]{6}$/);
});

test("public thread path is distinct from the guest UUID route", () => {
  assert.equal(publicThreadPath("v1.abc.def"), "/c/t/v1.abc.def");
});

// ── D-MSG-6: expiry follows the last linked record, not a flat 30 days ──────

import { resolveThreadTokenExpiry, refreshThreadToken } from "./thread-token";

const INQUIRY = "33333333-3333-4333-8333-333333333333";
const TENANT = "44444444-4444-4444-8444-444444444444";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tiny fake Supabase `.from(table).select().eq().is/maybeSingle()` chain
 *  driven off a plain rows map — just enough for resolveThreadTokenExpiry's
 *  two queries (conversation_records, then orders/admissions per link). */
function fakeAdmin(rows: {
  links?: { record_kind: string; record_id: string; unlinked_at?: string | null }[];
  orders?: Record<string, { created_at: string }>;
  admissions?: Record<string, { starts_at: string | null }>;
}) {
  return {
    from(table: string) {
      const chain = {
        _filters: {} as Record<string, string>,
        select() {
          return chain;
        },
        eq(col: string, val: string) {
          chain._filters[col] = val;
          return chain;
        },
        is(col: string, _val: null) {
          void col;
          return chain;
        },
        async maybeSingle() {
          if (table === "orders") {
            return { data: rows.orders?.[chain._filters.id] ?? null };
          }
          if (table === "admissions") {
            return { data: rows.admissions?.[chain._filters.id] ?? null };
          }
          return { data: null };
        },
        then(resolve: (v: { data: unknown }) => void) {
          // conversation_records is awaited directly (no maybeSingle call)
          if (table === "conversation_records") {
            const live = (rows.links ?? []).filter((l) => !l.unlinked_at);
            resolve({ data: live.filter((l) => l.record_id !== undefined) });
            return;
          }
          resolve({ data: null });
        },
      };
      return chain;
    },
  };
}

test("resolveThreadTokenExpiry falls back to 30 days when there are no links", async () => {
  const admin = fakeAdmin({ links: [] });
  const now = 1_000_000;
  const exp = await resolveThreadTokenExpiry(admin, INQUIRY, now);
  assert.equal(exp, now + 30 * DAY_MS);
});

test("resolveThreadTokenExpiry is 30 days after the LATEST linked record's date", async () => {
  const now = 1_000_000;
  const earlierOrder = new Date(now - 5 * DAY_MS).toISOString();
  const laterAppointment = new Date(now + 10 * DAY_MS).toISOString();
  const admin = fakeAdmin({
    links: [
      { record_kind: "order", record_id: "order-1" },
      { record_kind: "appointment", record_id: "adm-1" },
    ],
    orders: { "order-1": { created_at: earlierOrder } },
    admissions: { "adm-1": { starts_at: laterAppointment } },
  });
  const exp = await resolveThreadTokenExpiry(admin, INQUIRY, now);
  assert.equal(exp, Date.parse(laterAppointment) + 30 * DAY_MS);
});

test("resolveThreadTokenExpiry ignores an unlinked record and falls back if nothing else resolves", async () => {
  const now = 1_000_000;
  const admin = fakeAdmin({
    links: [{ record_kind: "order", record_id: "gone", unlinked_at: "2026-01-01T00:00:00Z" }],
    orders: {},
  });
  const exp = await resolveThreadTokenExpiry(admin, INQUIRY, now);
  assert.equal(exp, now + 30 * DAY_MS);
});

test("resolveThreadTokenExpiry skips kinds with no known date column (project/offer) rather than throwing", async () => {
  const now = 1_000_000;
  const admin = fakeAdmin({ links: [{ record_kind: "project", record_id: "proj-1" }] });
  const exp = await resolveThreadTokenExpiry(admin, INQUIRY, now);
  assert.equal(exp, now + 30 * DAY_MS);
});

test("signThreadToken bakes exp into the payload and verifyThreadToken checks it, not a flat 30d from iat", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  const mintMs = 1_000_000;
  const shortExp = mintMs + 2 * DAY_MS; // shorter than the default 30d window
  const token = signThreadToken(INQUIRY, TENANT, mintMs, shortExp);
  assert.ok(token);

  // Still valid just before the custom (short) expiry, even though iat+30d
  // would have said "valid" too — not a useful distinction yet...
  const stillValid = verifyThreadToken(token ?? "", shortExp - 1);
  assert.equal(stillValid.ok, true);
  if (stillValid.ok) assert.equal(stillValid.expiresAtMs, shortExp);

  // ...but past the CUSTOM expiry (still well inside iat+30d) it must be
  // rejected — proving verification reads payload.exp, not a flat 30d rule.
  const expiredEarly = verifyThreadToken(token ?? "", shortExp + 1);
  assert.equal(expiredEarly.ok, false);
  if (!expiredEarly.ok) assert.equal(expiredEarly.reason, "expired");

  process.env.GUEST_COOKIE_SECRET = prev;
});

test("verifyThreadToken falls back to iat+30d for a token minted before `exp` existed", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  // Mirrors the OLD signThreadToken shape (no exp field) by signing manually.
  const { createHmac } = require("node:crypto") as typeof import("node:crypto");
  const legacyPayload = { p: "pos-thread", iq: INQUIRY, tenant: TENANT, iat: 1_000 };
  const encoded = Buffer.from(JSON.stringify(legacyPayload), "utf8").toString("base64url");
  const sig = createHmac("sha256", "test-secret-for-pos-messages")
    .update(`pos-thread:v1:${encoded}`)
    .digest("base64url");
  const legacyToken = `v1.${encoded}.${sig}`;

  const withinOldWindow = verifyThreadToken(legacyToken, 1_000 + 29 * DAY_MS);
  assert.equal(withinOldWindow.ok, true);
  const pastOldWindow = verifyThreadToken(legacyToken, 1_000 + 31 * DAY_MS);
  assert.equal(pastOldWindow.ok, false);

  process.env.GUEST_COOKIE_SECRET = prev;
});

test("refreshThreadToken mints a token whose expiry matches resolveThreadTokenExpiry", async () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  const now = 1_000_000;
  const laterOrder = new Date(now + 3 * DAY_MS).toISOString();
  const admin = fakeAdmin({
    links: [{ record_kind: "order", record_id: "order-9" }],
    orders: { "order-9": { created_at: laterOrder } },
  });
  const token = await refreshThreadToken(admin, INQUIRY, TENANT, now);
  assert.ok(token);
  const verified = verifyThreadToken(token ?? "", now);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.expiresAtMs, Date.parse(laterOrder) + 30 * DAY_MS);
  }
  process.env.GUEST_COOKIE_SECRET = prev;
});
