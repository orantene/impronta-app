/**
 * Shared test fakes for the booking refund / dispute handlers (a recording
 * Supabase fake, a mock Stripe, no-op transition and notify stubs, ledger leg
 * fixtures). Same shapes as the end-to-end section of `refunds.test.ts`; used by
 * `refunds-charge-share.test.ts` (E5). Test-only, never imported by app code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import type { RefundDeps } from "../refunds";

export const E2E_PI = "pi_booking_1";
export const E2E_TXN = "txn_e2e";
export const E2E_BOOKING = "bk_e2e";

export type Row = Record<string, unknown>;

export type RecordingDb = {
  client: SupabaseClient;
  inserts: Array<{ table: string; row: Row }>;
  updates: Array<{ table: string; patch: Row }>;
  tables: Record<string, Row[]>;
};

/**
 * Recording Supabase fake serving the reads the handlers make and capturing
 * inserts + updates. Supports two terminal shapes: `.maybeSingle()`/`.single()`
 * resolve the matching seeded row; `.order()` or an awaited chain resolve the
 * matching row list. `.update(...).eq(...)` mutates matching rows in place;
 * `.insert(...).select().single()` returns the inserted row.
 */
export function makeDb(seed: Record<string, Row[]>): RecordingDb {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const inserts: RecordingDb["inserts"] = [];
  const updates: RecordingDb["updates"] = [];

  const make = (table: string) => {
    const eqFilters: Array<[string, unknown]> = [];
    let pendingPatch: Row | null = null;
    let isDelete = false;
    const matches = (r: Row) =>
      eqFilters.every(([c, v]) => {
        // PostgREST jsonb path filter used by refund / dispute PI fallback.
        if (c === "provider_metadata->>payment_intent_id") {
          const meta = r.provider_metadata as Record<string, unknown> | null | undefined;
          return (meta?.payment_intent_id ?? null) === v;
        }
        return r[c] === v;
      });

    // Apply a pending write (update/delete) to every matching row. Called from
    // the awaited terminal, so a chained `.eq().eq()` narrows the filter set
    // before the write lands — matching PostgREST semantics.
    const applyPendingWrite = () => {
      if (pendingPatch) {
        const patch = pendingPatch;
        for (const r of tables[table] ?? []) if (matches(r)) Object.assign(r, patch);
        updates.push({ table, patch });
        pendingPatch = null;
        return true;
      }
      if (isDelete) {
        tables[table] = (tables[table] ?? []).filter((r) => !matches(r));
        return true;
      }
      return false;
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (row: Row) => {
        const rows = (tables[table] ??= []);
        const stored = { ...row };
        rows.push(stored);
        inserts.push({ table, row: stored });
        const ret: Record<string, unknown> = {
          select: () => ret,
          single: () => Promise.resolve({ data: stored, error: null }),
          maybeSingle: () => Promise.resolve({ data: stored, error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return ret;
      },
      update: (patch: Row) => {
        pendingPatch = patch;
        return chain;
      },
      delete: () => {
        isDelete = true;
        return chain;
      },
      // `.eq` always narrows the filter set and returns the chain. The write (if
      // any) is applied when the chain is awaited, so `.update(...).eq().eq()`
      // works the same as a single `.eq`.
      eq: (col: string, val: unknown) => {
        eqFilters.push([col, val]);
        return chain;
      },
      order: () => Promise.resolve({ data: (tables[table] ?? []).filter(matches), error: null }),
      maybeSingle: () => Promise.resolve({ data: (tables[table] ?? []).find(matches) ?? null, error: null }),
      single: () => {
        const found = (tables[table] ?? []).find(matches) ?? null;
        return Promise.resolve(found ? { data: found, error: null } : { data: null, error: { message: "not found" } });
      },
      then: (resolve: (v: unknown) => void) => {
        if (applyPendingWrite()) return resolve({ data: null, error: null });
        return resolve({ data: (tables[table] ?? []).filter(matches), error: null });
      },
    };
    return chain;
  };

  return { client: { from: (t: string) => make(t) } as unknown as SupabaseClient, inserts, updates, tables };
}

export type ReversalCall = { transferId: string; amount: number; key?: string };

/** Mock Stripe: PI retrieve carries the booking linkage; createReversal honours
 *  the idempotency key (a re-used key replays the SAME reversal, never a 2nd). */
export function makeStripe(opts?: {
  transfers?: Array<{ id: string; amount: number; amount_reversed: number }>;
  metadata?: Record<string, string>;
  /** The PaymentIntent amount (the charge being refunded). Defaults to 100000. */
  amount?: number;
}) {
  const reversals: ReversalCall[] = [];
  const seenKeys = new Map<string, { id: string }>();
  const transfers = opts?.transfers ?? [];
  const metadata = opts?.metadata ?? { transaction_id: E2E_TXN, booking_id: E2E_BOOKING };
  const stripe = {
    paymentIntents: {
      retrieve: async (id: string) => ({ id, amount: opts?.amount ?? 100000, metadata }),
    },
    transfers: {
      list: async () => ({ data: transfers }),
      createReversal: async (transferId: string, params: { amount: number }, options?: { idempotencyKey?: string }) => {
        const key = options?.idempotencyKey;
        if (key && seenKeys.has(key)) return seenKeys.get(key)!;
        const r = { id: `trr_${reversals.length + 1}` };
        reversals.push({ transferId, amount: params.amount, key });
        if (key) seenKeys.set(key, r);
        return r;
      },
    },
  };
  return { reversals, stripe: stripe as unknown as Stripe };
}

/** No-op transition + notify stubs wired to a recording Supabase, capturing calls. */
export function stubDeps(
  db: RecordingDb,
  over: Partial<RefundDeps> = {},
): {
  deps: RefundDeps;
  calls: { markRefunded: string[]; markDisputed: string[]; notifyReversal: string[]; notifyPartial: number[] };
} {
  const calls = { markRefunded: [] as string[], markDisputed: [] as string[], notifyReversal: [] as string[], notifyPartial: [] as number[] };
  const ok = (id: string) => ({ ok: true as const, data: { id } as never });
  const deps: RefundDeps = {
    supabase: db.client,
    markRefunded: async (txnId: string) => {
      calls.markRefunded.push(txnId);
      return ok(txnId);
    },
    markDisputed: async (txnId: string) => {
      calls.markDisputed.push(txnId);
      return ok(txnId);
    },
    notifyBookingPayoutReversal: async (_sb, bookingId) => {
      calls.notifyReversal.push(bookingId);
    },
    notifyClientPartialRefund: async (_sb, _bookingId, cents) => {
      calls.notifyPartial.push(cents);
    },
    ...over,
  };
  return { deps, calls };
}

export const wsLeg = (over: Partial<Row> = {}): Row => ({
  id: "L_ws",
  booking_id: E2E_BOOKING,
  participant_id: "p1",
  party: "workspace",
  amount_cents: 24000,
  currency: "usd",
  status: "transferred",
  stripe_transfer_id: "tr_ws",
  attempts: 1,
  ...over,
});

export const talentLeg = (over: Partial<Row> = {}): Row => ({
  id: "L_t",
  booking_id: E2E_BOOKING,
  participant_id: "p1",
  party: "talent",
  amount_cents: 70000,
  currency: "usd",
  status: "transferred",
  stripe_transfer_id: "tr_t",
  attempts: 1,
  ...over,
});
