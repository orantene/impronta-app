import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClaimByEmailAdmin } from "./claim-by-email";
import { claimEverythingForVerifiedEmail } from "./claim-everything";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Result = { data: Row[] | Row | null; error: { code?: string; message: string } | null; count?: number };

type FakeQuery = {
  select: (cols?: string, opts?: { count?: string; head?: boolean }) => FakeQuery;
  eq: (col: string, value: unknown) => FakeQuery;
  is: (col: string, value: unknown) => FakeQuery;
  in: (col: string, values: unknown[]) => FakeQuery;
  not: (col: string, op: string, value: unknown) => FakeQuery;
  ilike: (col: string, value: string) => FakeQuery;
  or: (expr: string) => FakeQuery;
  update: (patch: Row) => FakeQuery;
  insert: (row: Row) => Promise<Result>;
  maybeSingle: () => Promise<Result>;
  then: (resolve: (value: Result) => void) => void;
};

/** In-memory PostgREST stand-in: applies filters, records every update. */
function makeAdmin(tables: Tables, opts: { uniqueTenantUser?: boolean } = {}) {
  const updates: Array<{ table: string; patch: Row }> = [];
  const admin: ClaimByEmailAdmin & { from: (t: string) => FakeQuery } = {
    from(table: string): FakeQuery {
      const rows = (tables[table] ??= []);
      const preds: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      let head = false;
      const unescape = (v: string) => v.replace(/\\([%_\\])/g, "$1").toLowerCase();
      const run = (): Result => {
        const hit = rows.filter((r) => preds.every((p) => p(r)));
        if (patch) {
          for (const r of hit) {
            if (
              opts.uniqueTenantUser &&
              table === "customers" &&
              "user_id" in patch &&
              rows.some((o) => o !== r && o.tenant_id === r.tenant_id && o.user_id === patch?.user_id)
            ) {
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            }
            Object.assign(r, patch);
            updates.push({ table, patch });
          }
          return { data: null, error: null };
        }
        return head ? { data: null, error: null, count: hit.length } : { data: hit, error: null };
      };
      const q: FakeQuery = {
        select(_c, o) {
          head = Boolean(o?.head);
          return q;
        },
        eq(col, value) {
          preds.push((r) => r[col] === value);
          return q;
        },
        is(col, value) {
          preds.push((r) => (value === null ? r[col] == null : r[col] === value));
          return q;
        },
        in(col, values) {
          preds.push((r) => values.includes(r[col]));
          return q;
        },
        not(col, _op, _value) {
          preds.push((r) => r[col] != null);
          return q;
        },
        ilike(col, value) {
          preds.push((r) => String(r[col] ?? "").toLowerCase() === unescape(value));
          return q;
        },
        or(expr) {
          const uid = /client_user_id\.eq\.([^,]+)/.exec(expr)?.[1];
          preds.push((r) => r.client_user_id == null || r.client_user_id === uid);
          return q;
        },
        update(p) {
          patch = p;
          return q;
        },
        async insert(row) {
          rows.push({ id: `ins-${rows.length}`, ...row });
          return { data: null, error: null };
        },
        async maybeSingle() {
          const res = run();
          const list = Array.isArray(res.data) ? res.data : [];
          return { data: list[0] ?? null, error: res.error };
        },
        then(resolve) {
          resolve(run());
        },
      };
      return q;
    },
  };
  return { admin, updates };
}

const ME = "user-me";
const OTHER = "user-other";
const EMAIL = "guest@example.com";

function seed(): Tables {
  return {
    client_profiles: [{ id: "cp-me", user_id: ME }],
    inquiries: [
      { id: "inq-1", tenant_id: "t1", client_user_id: null, contact_email: "Guest@Example.com", guest_session_id: "gs-1" },
      { id: "inq-other", tenant_id: "t1", client_user_id: OTHER, contact_email: EMAIL, guest_session_id: "gs-x" },
      { id: "inq-stranger", tenant_id: "t1", client_user_id: null, contact_email: "stranger@example.com", guest_session_id: "gs-2" },
    ],
    inquiry_messages: [
      { id: "m1", inquiry_id: "inq-1", guest_session_id: "gs-1", sender_user_id: null },
      { id: "m-staff", inquiry_id: "inq-1", guest_session_id: null, sender_user_id: "staff-1" },
      { id: "m-x", inquiry_id: "inq-stranger", guest_session_id: "gs-2", sender_user_id: null },
    ],
    customers: [
      { id: "cu-1", tenant_id: "t2", user_id: null, client_profile_id: null, email: "GUEST@example.com", merged_into_id: null },
      { id: "cu-other", tenant_id: "t3", user_id: OTHER, client_profile_id: null, email: EMAIL, merged_into_id: null },
      { id: "cu-stranger", tenant_id: "t2", user_id: null, client_profile_id: null, email: "stranger@example.com", merged_into_id: null },
    ],
    agency_bookings: [
      // instant book: no inquiry, only a contact email
      { id: "bk-email", tenant_id: "t2", client_user_id: null, contact_email: EMAIL, customer_id: "cu-1", source_inquiry_id: null },
      // booking left behind by an inquiry claim, no contact email on the row
      { id: "bk-inq", tenant_id: "t1", client_user_id: null, contact_email: null, customer_id: null, source_inquiry_id: "inq-1" },
      { id: "bk-other", tenant_id: "t3", client_user_id: OTHER, contact_email: EMAIL, customer_id: "cu-other", source_inquiry_id: null },
      // derived link but a DIFFERENT contact email: never claimed
      { id: "bk-mismatch", tenant_id: "t2", client_user_id: null, contact_email: "someone@else.com", customer_id: "cu-1", source_inquiry_id: null },
    ],
    booking_transactions: [
      { id: "tx-email", booking_id: "bk-email", payer_user_id: null, payer_email: EMAIL, status: "paid" },
      { id: "tx-noemail", booking_id: "bk-inq", payer_user_id: null, payer_email: null, status: "paid" },
      { id: "tx-other", booking_id: "bk-other", payer_user_id: OTHER, payer_email: EMAIL, status: "paid" },
      { id: "tx-stranger", booking_id: "bk-mismatch", payer_user_id: null, payer_email: "someone@else.com", status: "paid" },
    ],
  };
}

const byId = (t: Tables, table: string, id: string) => t[table].find((r) => r.id === id) as Row;

test("claims only rows whose contact email equals the verified email", async () => {
  const t = seed();
  const { admin } = makeAdmin(t);
  const res = await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: "  GUEST@example.com " });
  assert.equal(byId(t, "inquiries", "inq-1").client_user_id, ME);
  assert.equal(byId(t, "inquiries", "inq-stranger").client_user_id, null);
  assert.equal(byId(t, "customers", "cu-1").user_id, ME);
  assert.equal(byId(t, "customers", "cu-1").client_profile_id, "cp-me");
  assert.equal(byId(t, "customers", "cu-stranger").user_id, null);
  assert.equal(byId(t, "agency_bookings", "bk-email").client_user_id, ME);
  assert.equal(byId(t, "agency_bookings", "bk-inq").client_user_id, ME);
  assert.equal(byId(t, "agency_bookings", "bk-mismatch").client_user_id, null);
  assert.equal(byId(t, "booking_transactions", "tx-email").payer_user_id, ME);
  assert.equal(byId(t, "booking_transactions", "tx-noemail").payer_user_id, ME);
  assert.equal(byId(t, "booking_transactions", "tx-stranger").payer_user_id, null);
  assert.equal(byId(t, "inquiry_messages", "m1").sender_user_id, ME);
  assert.equal(byId(t, "inquiry_messages", "m-staff").sender_user_id, "staff-1");
  assert.equal(byId(t, "inquiry_messages", "m-x").sender_user_id, null);
  assert.deepEqual(
    { c: res.customers, b: res.bookings, x: res.transactions },
    { c: 1, b: 2, x: 2 },
  );
});

test("never takes rows owned by a different user", async () => {
  const t = seed();
  const { admin } = makeAdmin(t);
  await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: EMAIL });
  assert.equal(byId(t, "inquiries", "inq-other").client_user_id, OTHER);
  assert.equal(byId(t, "customers", "cu-other").user_id, OTHER);
  assert.equal(byId(t, "agency_bookings", "bk-other").client_user_id, OTHER);
  assert.equal(byId(t, "booking_transactions", "tx-other").payer_user_id, OTHER);
});

test("empty or missing email claims nothing", async () => {
  const t = seed();
  const { admin, updates } = makeAdmin(t);
  await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: "   " });
  await claimEverythingForVerifiedEmail({ admin, userId: "", verifiedEmail: EMAIL });
  assert.equal(updates.length, 0);
});

test("idempotent: a second run writes no ownership again", async () => {
  const t = seed();
  const { admin, updates } = makeAdmin(t);
  await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: EMAIL });
  const owned = (u: typeof updates) =>
    u.filter((x) => ["customers", "agency_bookings", "booking_transactions", "inquiry_messages"].includes(x.table)).length;
  const first = owned(updates);
  const second = await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: EMAIL });
  assert.equal(owned(updates), first, "second run must not rewrite claimed rows");
  assert.deepEqual(
    { c: second.customers, b: second.bookings, x: second.transactions, i: second.inquiries },
    { c: 0, b: 0, x: 0, i: 0 },
  );
});

test("a customer row that would collide on (tenant, user) is skipped, the rest still claims", async () => {
  const t = seed();
  t.customers.push({ id: "cu-mine-t2", tenant_id: "t2", user_id: ME, client_profile_id: "cp-me", email: "old@me.com", merged_into_id: null });
  const { admin } = makeAdmin(t, { uniqueTenantUser: true });
  const res = await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: EMAIL });
  assert.equal(byId(t, "customers", "cu-1").user_id, null);
  assert.equal(res.customers, 0);
  assert.equal(byId(t, "agency_bookings", "bk-email").client_user_id, ME, "the email-matched booking still attaches");
});

type RpcCall = { fn: string; args: Record<string, unknown> };
function withRpc<A extends object>(admin: A, result: { data: unknown; error: { message: string } | null }) {
  const calls: RpcCall[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return result;
  };
  return { admin: Object.assign(admin, { rpc }), calls };
}

test("TUL-691: a duplicate customer triggers merge_verified_client_customers with the user's id", async () => {
  const t = seed();
  t.customers.push({ id: "cu-mine-t2", tenant_id: "t2", user_id: ME, client_profile_id: "cp-me", email: "old@me.com", merged_into_id: null });
  const { admin: base } = makeAdmin(t, { uniqueTenantUser: true });
  const { admin, calls } = withRpc(base, { data: 1, error: null });
  await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: EMAIL });
  assert.deepEqual(calls, [{ fn: "merge_verified_client_customers", args: { p_user_id: ME } }]);
});

test("TUL-691: a merge RPC error is logged, the claim still resolves", async () => {
  const t = seed();
  t.customers.push({ id: "cu-mine-t2", tenant_id: "t2", user_id: ME, client_profile_id: "cp-me", email: "old@me.com", merged_into_id: null });
  const { admin: base } = makeAdmin(t, { uniqueTenantUser: true });
  const { admin, calls } = withRpc(base, { data: null, error: { message: "boom" } });
  const res = await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: EMAIL });
  assert.equal(calls.length, 1);
  assert.equal(byId(t, "agency_bookings", "bk-email").client_user_id, ME);
  assert.equal(res.customers, 0);
});

test("TUL-691: no duplicate, no merge RPC", async () => {
  const { admin: base } = makeAdmin(seed(), { uniqueTenantUser: true });
  const { admin, calls } = withRpc(base, { data: 0, error: null });
  await claimEverythingForVerifiedEmail({ admin, userId: ME, verifiedEmail: EMAIL });
  assert.equal(calls.length, 0);
});
