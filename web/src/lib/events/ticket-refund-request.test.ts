import assert from "node:assert/strict";
import test from "node:test";

/**
 * `requestTicketRefund` against a scripted PostgREST fake (the
 * `ticket-delivery.test.ts` shape): `from(table)` returns a chain that
 * records filters and payloads and resolves from `rows[table]`. The signed
 * code is minted by the real `signAdmissionToken` under a test secret.
 */
process.env.GUEST_COOKIE_SECRET ??= "test-secret-test-secret-test-secret-1234";

import { signAdmissionToken } from "@/lib/sessions/admission-token";
import { requestTicketRefund } from "./ticket-refund-request";

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> };

function fakeAdmin(rows: Record<string, Row[]>, calls: Call[], opts: { insertError?: { code: string; message: string }; failSelect?: string[] } = {}) {
  return {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      let result: Row[] = rows[table] ?? [];
      let columns = "";
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      const filter = (op: string) => (col: string, val: unknown) => {
        call.filters.push([col, op, val]);
        if (op === "eq") result = result.filter((r) => r[col] === val);
        if (op === "in") result = result.filter((r) => (val as unknown[]).includes(r[col]));
        return chain;
      };
      const failing = () => (opts.failSelect ?? []).some((c) => columns.includes(c));
      Object.assign(chain, {
        select: (cols?: string) => { columns = cols ?? ""; return chain; },
        insert: (payload: unknown) => {
          call.op = "insert"; call.payload = payload;
          return Promise.resolve(opts.insertError ? { data: null, error: opts.insertError } : { data: null, error: null });
        },
        eq: filter("eq"), in: filter("in"),
        order: self, limit: self,
        maybeSingle: async () => (failing() ? { data: null, error: { message: "column does not exist", code: "42703" } } : { data: result[0] ?? null, error: null }),
        then: (res: (v: { data: Row[] | null; error: unknown }) => unknown) =>
          Promise.resolve(failing() ? { data: null, error: { message: "column does not exist" } } : { data: result, error: null }).then(res),
      });
      return chain;
    },
  };
}

const T = "11111111-1111-4111-8111-111111111111";
const ADM = "22222222-2222-4222-8222-222222222222";
const LINE = "line-1"; const ORDER = "order-1"; const SESSION = "sess-1"; const EVENT = "ev-1"; const VENUE = "venue-1";
const NOW = "2026-10-01T12:00:00.000Z";

function world(over: Partial<Record<string, Row[]>> = {}, patch: { admission?: Row; event?: Row; line?: Row } = {}) {
  return {
    admissions: [
      { id: ADM, tenant_id: T, token_version: 1, status: "valid", admitted_count: 0, session_id: SESSION, order_line_id: LINE, party_size: 2, space_id: null, starts_at: "2026-10-03T23:00:00Z", line_seq: 1, ...patch.admission },
    ],
    order_lines: [{ id: LINE, tenant_id: T, order_id: ORDER, label: "Mesa VIP", total_cents: 8000, refunded_cents: 0, ...patch.line }],
    orders: [{ id: ORDER, tenant_id: T, status: "paid", receipt_code: "k7x2mq9pl3f9a" }],
    sessions: [{ id: SESSION, tenant_id: T, starts_at: "2026-10-03T23:00:00Z", event_id: EVENT, venue_id: VENUE }],
    events: [{ id: EVENT, tenant_id: T, title: "LUMINA", slug: "lumina", status: "published", description: null, doors_offset_minutes: 60, venue_id: VENUE, cover_media_id: null, page_id: null, refunds_open: true, refund_policy_key: "flexible", refunds_close_at: null, ...patch.event }],
    venues: [{ id: VENUE, tenant_id: T, name: "Sala Norte", city: "Cancún", timezone: "America/Cancun" }],
    agencies: [{ id: T, timezone: "America/Cancun", default_locale: "es", display_name: "El Paisa" }],
    ticket_refund_intents: [],
    media_assets: [],
    cms_pages: [],
    spaces: [],
    ...over,
  };
}

const code = () => signAdmissionToken(ADM, 1)!;

test("a valid request inserts one guest_request intent for the admission's order line", async () => {
  const calls: Call[] = [];
  const res = await requestTicketRefund(fakeAdmin(world(), calls), { tenantId: T, code: code(), now: NOW });
  assert.deepEqual(res, { ok: true, policyKey: "flexible", awaitingReview: false });
  const ins = calls.find((c) => c.table === "ticket_refund_intents" && c.op === "insert");
  assert.ok(ins, "the intent was written");
  assert.deepEqual(ins.payload, {
    tenant_id: T,
    order_id: ORDER,
    order_line_id: LINE,
    reason: "guest_request",
    source: "guest_request",
    requested_by_admission_id: ADM,
  });
});

test("a manual policy inserts the intent already claimed so the cron never executes it", async () => {
  const calls: Call[] = [];
  const res = await requestTicketRefund(fakeAdmin(world({}, { event: { refund_policy_key: "manual" } }), calls), { tenantId: T, code: code(), now: NOW });
  assert.deepEqual(res, { ok: true, policyKey: "manual", awaitingReview: true });
  const ins = calls.find((c) => c.table === "ticket_refund_intents" && c.op === "insert")!;
  const p = ins.payload as Row;
  assert.equal(p.result, "awaiting_review");
  assert.equal(typeof p.claimed_at, "string");
});

test("refusals: a bad code, a superseded code, and every eligibility gate", async () => {
  const at = (w: ReturnType<typeof world>, c = code()) => requestTicketRefund(fakeAdmin(w, []), { tenantId: T, code: c, now: NOW });
  assert.deepEqual(await at(world(), "not-a-token"), { ok: false, reason: "not_found" });
  assert.deepEqual(await at(world(), signAdmissionToken(ADM, 1)!.replace(/.$/, (ch) => (ch === "a" ? "b" : "a"))), { ok: false, reason: "not_found" });
  assert.deepEqual(await at(world({}, { admission: { token_version: 2 } })), { ok: false, reason: "superseded" });
  assert.deepEqual(await at(world({ admissions: [] })), { ok: false, reason: "not_found" });
  assert.deepEqual(await at(world({}, { event: { refunds_open: false } })), { ok: false, reason: "refunds_closed" });
  assert.deepEqual(await at(world({}, { event: { refunds_close_at: "2026-09-30T00:00:00Z" } })), { ok: false, reason: "refunds_closed" });
  assert.deepEqual(await at(world({}, { admission: { admitted_count: 2 } })), { ok: false, reason: "already_used" });
  assert.deepEqual(await at(world({}, { admission: { status: "void" } })), { ok: false, reason: "not_valid" });
  assert.deepEqual(await at(world({}, { event: { status: "cancelled" } })), { ok: false, reason: "event_cancelled" });
  assert.deepEqual(await at(world({}, { line: { total_cents: 0 } })), { ok: false, reason: "nothing_to_refund" });
  assert.deepEqual(await at(world({ ticket_refund_intents: [{ id: "i1", tenant_id: T, order_line_id: LINE }] })), { ok: false, reason: "already_requested" });
  assert.deepEqual(await at(world({}, { admission: { order_line_id: null } })), { ok: false, reason: "nothing_to_refund" });
});

test("a failed facts read is unavailable, never closed, and writes nothing", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world(), calls, { failSelect: ["refunds_open"] });
  const res = await requestTicketRefund(admin, { tenantId: T, code: code(), now: NOW });
  assert.deepEqual(res, { ok: false, reason: "unavailable" });
  assert.equal(calls.some((c) => c.table === "ticket_refund_intents" && c.op === "insert"), false, "nothing written");
  const venueDown = fakeAdmin(world(), [], { failSelect: ["name, city, timezone"] });
  assert.deepEqual(await requestTicketRefund(venueDown, { tenantId: T, code: code(), now: NOW }), { ok: false, reason: "unavailable" });
});

test("a unique-violation on insert is already_requested, never a second refund", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world(), calls, { insertError: { code: "23505", message: "duplicate key" } });
  assert.deepEqual(await requestTicketRefund(admin, { tenantId: T, code: code(), now: NOW }), { ok: false, reason: "already_requested" });
  const other = fakeAdmin(world(), [], { insertError: { code: "42501", message: "denied" } });
  assert.deepEqual(await requestTicketRefund(other, { tenantId: T, code: code(), now: NOW }), { ok: false, reason: "unavailable" });
});

test("every read is tenant-scoped", async () => {
  const calls: Call[] = [];
  await requestTicketRefund(fakeAdmin(world(), calls), { tenantId: T, code: code(), now: NOW });
  for (const c of calls) {
    if (c.op !== "select") continue;
    if (c.table === "agencies") { assert.ok(c.filters.some(([col, , v]) => col === "id" && v === T)); continue; }
    if (c.table === "media_assets" || c.table === "cms_pages") continue; // by primary key from a tenant-scoped row
    assert.ok(c.filters.some(([col, , v]) => col === "tenant_id" && v === T), `${c.table} read is tenant-scoped`);
  }
});
