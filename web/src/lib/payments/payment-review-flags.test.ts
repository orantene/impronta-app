/**
 * TUL-1283 / TUL-1284 / TUL-1268 M2: a charge Stripe took that the settle path
 * cannot book cleanly leaves a durable flag on its money row, instead of a log
 * line nobody reads.
 *
 * The flag reuses the existing attention stamp on `booking_transactions.metadata`
 * (`needs_attention`, the same field paid-after-cancel and refund_failed use),
 * plus a `payment_flags` list so a second, different problem on the same row is
 * never lost behind the first one.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyPaymentReviewFlag,
  openPaymentReviewFlags,
  resolvePaymentReviewFlag,
  type PaymentReviewFlagInput,
} from "./payment-review-flags-model";
import { flagPaymentForReview, resolvePaymentFlag, type FlagPaymentDeps } from "./payment-review-flags";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moneyStore } from "@/lib/talent-agenda/__fixtures__/money-store";

const NOW = "2026-10-19T12:00:00.000Z";

const MISMATCH: PaymentReviewFlagInput = {
  reason: "amount_mismatch",
  paymentIntentId: "pi_a",
  otherPaymentIntentId: null,
  expectedAmountCents: 101500,
  expectedCurrency: "MXN",
  chargedAmountCents: 90000,
  chargedCurrency: "mxn",
  rowStatus: "payment_requested",
  stripeEventId: "evt_1",
};

describe("applyPaymentReviewFlag (pure)", () => {
  test("adds one flag and stamps needs_attention when the row has none", () => {
    const r = applyPaymentReviewFlag({ payment_link: "l1" }, MISMATCH, NOW);
    assert.equal(r.created, true);
    assert.equal(r.metadata.payment_link, "l1", "existing metadata is kept");
    assert.equal(r.metadata.needs_attention, "amount_mismatch");
    assert.equal(r.metadata.needs_attention_at, NOW);
    const flags = openPaymentReviewFlags(r.metadata);
    assert.equal(flags.length, 1);
    assert.deepEqual(flags[0], {
      reason: "amount_mismatch",
      paymentIntentId: "pi_a",
      otherPaymentIntentId: null,
      expectedAmountCents: 101500,
      expectedCurrency: "MXN",
      chargedAmountCents: 90000,
      chargedCurrency: "mxn",
      rowStatus: "payment_requested",
      stripeEventId: "evt_1",
      flaggedAt: NOW,
    });
  });

  test("the same reason + PaymentIntent twice is one flag (replays are no-ops)", () => {
    const once = applyPaymentReviewFlag(null, MISMATCH, NOW);
    const twice = applyPaymentReviewFlag(once.metadata, { ...MISMATCH, stripeEventId: "evt_2" }, NOW);
    assert.equal(twice.created, false);
    assert.equal(openPaymentReviewFlags(twice.metadata).length, 1);
  });

  test("a different problem on the same row is kept, and the first stamp is not overwritten", () => {
    const first = applyPaymentReviewFlag({ needs_attention: "paid_after_cancellation" }, MISMATCH, NOW);
    assert.equal(first.metadata.needs_attention, "paid_after_cancellation");
    const dup = applyPaymentReviewFlag(
      first.metadata,
      { ...MISMATCH, reason: "duplicate_charge", paymentIntentId: "pi_b", otherPaymentIntentId: "pi_a" },
      NOW,
    );
    assert.equal(dup.created, true);
    assert.deepEqual(
      openPaymentReviewFlags(dup.metadata).map((f) => f.reason),
      ["amount_mismatch", "duplicate_charge"],
    );
  });

  test("garbage in metadata.payment_flags never throws and is ignored", () => {
    assert.deepEqual(openPaymentReviewFlags({ payment_flags: "nope" }), []);
    assert.deepEqual(openPaymentReviewFlags({ payment_flags: [null, 3, { reason: "unknown" }] }), []);
    assert.deepEqual(openPaymentReviewFlags(null), []);
  });

  test("a resolved flag is not open", () => {
    const r = applyPaymentReviewFlag(null, MISMATCH, NOW);
    const flags = (r.metadata.payment_flags as Array<Record<string, unknown>>).map((f) => ({ ...f, resolved_at: NOW }));
    assert.deepEqual(openPaymentReviewFlags({ ...r.metadata, payment_flags: flags }), []);
  });
});

describe("resolvePaymentReviewFlag (pure)", () => {
  test("stamps resolved_at and resolved_by on exactly that flag, which then drops out of the open list", () => {
    const one = applyPaymentReviewFlag(null, MISMATCH, NOW);
    const two = applyPaymentReviewFlag(
      one.metadata,
      { ...MISMATCH, reason: "duplicate_charge", paymentIntentId: "pi_b", otherPaymentIntentId: "pi_a" },
      NOW,
    );
    const r = resolvePaymentReviewFlag(two.metadata, { reason: "amount_mismatch", paymentIntentId: "pi_a" }, {
      at: "2026-10-20T09:00:00.000Z",
      userId: "u1",
    });
    assert.equal(r.resolved, true);
    assert.deepEqual(openPaymentReviewFlags(r.metadata).map((f) => f.reason), ["duplicate_charge"]);
    const stored = (r.metadata.payment_flags as Array<Record<string, unknown>>)[0]!;
    assert.equal(stored.resolved_at, "2026-10-20T09:00:00.000Z");
    assert.equal(stored.resolved_by, "u1");
  });

  test("the attention stamp clears with the last open flag of its reason, and only then", () => {
    const one = applyPaymentReviewFlag(null, MISMATCH, NOW);
    assert.equal(one.metadata.needs_attention, "amount_mismatch");
    const r = resolvePaymentReviewFlag(one.metadata, { reason: "amount_mismatch", paymentIntentId: "pi_a" }, { at: NOW, userId: "u1" });
    assert.equal(r.metadata.needs_attention, undefined);
    // A different stamp (paid after cancellation) is never touched.
    const other = applyPaymentReviewFlag({ needs_attention: "paid_after_cancellation" }, MISMATCH, NOW);
    const r2 = resolvePaymentReviewFlag(other.metadata, { reason: "amount_mismatch", paymentIntentId: "pi_a" }, { at: NOW, userId: "u1" });
    assert.equal(r2.metadata.needs_attention, "paid_after_cancellation");
  });

  test("an unknown or already resolved flag resolves nothing", () => {
    const one = applyPaymentReviewFlag(null, MISMATCH, NOW);
    assert.equal(resolvePaymentReviewFlag(one.metadata, { reason: "duplicate_charge", paymentIntentId: "pi_a" }, { at: NOW, userId: "u" }).resolved, false);
    const done = resolvePaymentReviewFlag(one.metadata, { reason: "amount_mismatch", paymentIntentId: "pi_a" }, { at: NOW, userId: "u" });
    assert.equal(resolvePaymentReviewFlag(done.metadata, { reason: "amount_mismatch", paymentIntentId: "pi_a" }, { at: NOW, userId: "u" }).resolved, false);
  });
});

type Notified = Parameters<FlagPaymentDeps["notify"]>[0];

const READ_AT = "2026-10-19T11:00:00.000Z";

function store(meta: Record<string, unknown> | null = { payment_link: "l1" }) {
  const s = moneyStore({
    booking_transactions: [
      {
        id: "x1",
        status: "payment_requested",
        gross_amount_cents: 101500,
        currency: "MXN",
        source_tenant_id: "t1",
        booking_id: "b1",
        source_inquiry_id: null,
        updated_at: READ_AT,
        metadata: meta,
      },
    ],
  });
  // The fixture implements the slice of the client the writer calls.
  return { ...s, admin: s.admin as unknown as Pick<SupabaseClient, "from"> };
}

describe("flagPaymentForReview (writer)", () => {
  test("writes exactly one flag, leaves the amount untouched, and rings the workspace Money bell", async () => {
    const s = store();
    const notified: Notified[] = [];
    const r = await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, {
      notify: (p) => notified.push(p),
    });
    assert.deepEqual(r, { ok: true, created: true });
    const row = s.tables.booking_transactions[0]!;
    assert.equal(row.gross_amount_cents, 101500, "no amount changes");
    assert.equal(row.status, "payment_requested", "no status changes");
    assert.equal(openPaymentReviewFlags(row.metadata).length, 1);
    assert.equal(s.writes.length, 1);
    assert.deepEqual(Object.keys(s.writes[0]!.patch).sort(), ["metadata", "updated_at"], "only metadata (+ its version) is written");
    assert.equal(notified.length, 1);
    assert.equal(notified[0]!.tenantId, "t1");
    assert.equal(notified[0]!.reason, "amount_mismatch");
  });

  test("a replay writes nothing and does not ring again", async () => {
    const s = store();
    const notified: Notified[] = [];
    const deps = { notify: (p: Notified) => notified.push(p) };
    await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, deps);
    const r = await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, deps);
    assert.deepEqual(r, { ok: true, created: false });
    assert.equal(s.writes.length, 1);
    assert.equal(notified.length, 1);
  });

  test("a missing row is an error, not a silent success", async () => {
    const s = store();
    const r = await flagPaymentForReview(s.admin, { transactionId: "nope", flag: MISMATCH, nowIso: NOW }, {
      notify: () => undefined,
    });
    assert.equal(r.ok, false);
  });
});

// ── Review fix 3: optimistic concurrency on updated_at ──────────────────

type CasRow = {
  id: string;
  source_tenant_id: string;
  booking_id: string | null;
  source_inquiry_id: string | null;
  updated_at: string;
  metadata: Record<string, unknown>;
};

/**
 * A row that another writer can change between this writer's read and its
 * write (`onRead` runs after each read). The update applies only when every
 * `.eq` filter matches, which is how `updated_at = $read` loses a race.
 */
function casStore(row: CasRow, onRead: (readNo: number, row: CasRow) => void = () => undefined) {
  let reads = 0;
  const writes: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "booking_transactions");
      const filters: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      const matches = () => filters.every(([c, v]) => (row as unknown as Record<string, unknown>)[c] === v);
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => {
          patch = p;
          return q;
        },
        eq: (c: string, v: unknown) => {
          filters.push([c, v]);
          return q;
        },
        maybeSingle: async () => {
          reads += 1;
          const data = matches() ? { ...row, metadata: JSON.parse(JSON.stringify(row.metadata)) as Record<string, unknown> } : null;
          onRead(reads, row);
          return { data, error: null };
        },
        then: (resolve: (v: { data: Array<{ id: string }>; error: null }) => unknown) => {
          if (patch && matches()) {
            Object.assign(row, patch);
            writes.push(patch);
            return Promise.resolve(resolve({ data: [{ id: row.id }], error: null }));
          }
          return Promise.resolve(resolve({ data: [], error: null }));
        },
      };
      return q;
    },
  };
  return { admin: admin as unknown as Pick<SupabaseClient, "from">, writes, reads: () => reads };
}

function casRow(meta: Record<string, unknown> = {}): CasRow {
  return { id: "x1", source_tenant_id: "t1", booking_id: null, source_inquiry_id: null, updated_at: READ_AT, metadata: meta };
}

describe("review fix 3: the flag write is conditional on the version it read", () => {
  test("another writer lands between read and write: the writer re-reads and keeps both changes", async () => {
    const row = casRow({ payment_link: "l1" });
    const s = casStore(row, (n, r) => {
      if (n === 1) {
        // A concurrent writer stamps something else on the same row.
        r.metadata = { ...r.metadata, receipt_sent: true };
        r.updated_at = "2026-10-19T11:00:01.000Z";
      }
    });
    const notified: Notified[] = [];
    const r = await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, {
      notify: (p) => notified.push(p),
    });
    assert.deepEqual(r, { ok: true, created: true });
    assert.equal(s.reads(), 2, "the lost race is retried");
    assert.equal(s.writes.length, 1);
    assert.equal(row.metadata.receipt_sent, true, "the other writer's stamp is not clobbered");
    assert.equal(row.metadata.payment_link, "l1");
    assert.equal(openPaymentReviewFlags(row.metadata).length, 1);
    assert.equal(notified.length, 1);
  });

  test("two simultaneous identical events: one flag, one bell", async () => {
    const row = casRow();
    const notified: Notified[] = [];
    const deps = { notify: (p: Notified) => notified.push(p) };
    // The rival event writes the same flag right after our first read.
    const s = casStore(row, (n, r) => {
      if (n === 1) {
        r.metadata = applyPaymentReviewFlag(r.metadata, MISMATCH, NOW).metadata;
        r.updated_at = "2026-10-19T11:00:01.000Z";
      }
    });
    const r = await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, deps);
    assert.deepEqual(r, { ok: true, created: false });
    assert.equal(s.writes.length, 0);
    assert.equal(notified.length, 0, "the rival rang; this one must not ring again");
    assert.equal((row.metadata.payment_flags as unknown[]).length, 1);
  });

  test("losing the race three times is a retryable error, never a silent success", async () => {
    const row = casRow();
    let bump = 0;
    const s = casStore(row, (_n, r) => {
      bump += 1;
      r.updated_at = `2026-10-19T11:00:0${bump}.000Z`;
    });
    const r = await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, {
      notify: () => undefined,
    });
    assert.equal(r.ok, false);
    assert.equal(s.reads(), 3);
    assert.equal(s.writes.length, 0);
  });
});

// ── Review fix 4: a person marks a flag resolved ───────────────────────

describe("resolvePaymentFlag (writer)", () => {
  test("stamps resolved_at on the flag, scoped to the workspace", async () => {
    const row = casRow(applyPaymentReviewFlag(null, MISMATCH, NOW).metadata);
    const s = casStore(row);
    const r = await resolvePaymentFlag(s.admin, {
      tenantId: "t1",
      transactionId: "x1",
      reason: "amount_mismatch",
      paymentIntentId: "pi_a",
      actorUserId: "u1",
      nowIso: "2026-10-20T09:00:00.000Z",
    });
    assert.deepEqual(r, { ok: true, resolved: true });
    assert.deepEqual(openPaymentReviewFlags(row.metadata), []);
    assert.equal((row.metadata.payment_flags as Array<Record<string, unknown>>)[0]!.resolved_by, "u1");
  });

  test("another workspace's row is not found and is not touched", async () => {
    const row = casRow(applyPaymentReviewFlag(null, MISMATCH, NOW).metadata);
    const s = casStore(row);
    const r = await resolvePaymentFlag(s.admin, {
      tenantId: "t2",
      transactionId: "x1",
      reason: "amount_mismatch",
      paymentIntentId: "pi_a",
      actorUserId: "u1",
    });
    assert.deepEqual(r, { ok: false, error: "not_found" });
    assert.equal(s.writes.length, 0);
  });

  test("resolving twice is a no-op the second time", async () => {
    const row = casRow(applyPaymentReviewFlag(null, MISMATCH, NOW).metadata);
    const s = casStore(row);
    const input = { tenantId: "t1", transactionId: "x1", reason: "amount_mismatch" as const, paymentIntentId: "pi_a", actorUserId: "u1" };
    await resolvePaymentFlag(s.admin, input);
    assert.deepEqual(await resolvePaymentFlag(s.admin, input), { ok: true, resolved: false });
    assert.equal(s.writes.length, 1);
  });
});
