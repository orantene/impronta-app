import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSellerPlatformForTransaction as resolve } from "./charge-platform";

/** Minimal chainable fake: each table maps to a {data,error} result. */
function fakeSb(tables: Record<string, { data: unknown; error: unknown }>): SupabaseClient {
  return {
    from: (t: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => tables[t] };
      return q;
    },
  } as unknown as SupabaseClient;
}

test("DB error on the transaction read fails closed, not 'us'", async () => {
  const r = await resolve("t1", fakeSb({ booking_transactions: { data: null, error: { message: "boom" } } }));
  assert.equal(r.ok, false);
});
test("missing transaction row fails closed", async () => {
  const r = await resolve("t1", fakeSb({ booking_transactions: { data: null, error: null } }));
  assert.equal(r.ok, false);
});
test("no client fails closed", async () => {
  assert.equal((await resolve("t1", null)).ok, false);
});
test("DB error reading the seller account fails closed", async () => {
  const r = await resolve(
    "t1",
    fakeSb({
      booking_transactions: { data: { source_tenant_id: "a1", payout_receiver_id: null }, error: null },
      agencies: { data: null, error: { message: "boom" } },
    }),
  );
  assert.equal(r.ok, false);
});
test("MX seller resolves to mx", async () => {
  const r = await resolve(
    "t1",
    fakeSb({
      booking_transactions: { data: { source_tenant_id: "a1", payout_receiver_id: null }, error: null },
      agencies: { data: { stripe_account_platform: "mx" }, error: null },
    }),
  );
  assert.deepEqual(r, { ok: true, key: "mx" });
});
test("missing seller row (no error), no country source, resolves to us", async () => {
  const r = await resolve(
    "t1",
    fakeSb({
      booking_transactions: { data: { source_tenant_id: "a1", payout_receiver_id: null }, error: null },
      agencies: { data: null, error: null },
    }),
  );
  assert.deepEqual(r, { ok: true, key: "us" });
});
test("thrown exception reading the seller account fails closed", async () => {
  const sb = {
    from: (t: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          if (t === "agencies") throw new Error("net");
          return { data: { source_tenant_id: "a1", payout_receiver_id: null }, error: null };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  assert.equal((await resolve("t1", sb)).ok, false);
});
