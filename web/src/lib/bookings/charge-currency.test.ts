import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTransactionChargeCurrency } from "./charge-currency";

function fake(row: { currency_code: string | null } | null, error: unknown = null): SupabaseClient {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: row, error }),
  };
  return { from: () => q } as unknown as SupabaseClient;
}

test("an explicit currency wins and is uppercased", async () => {
  assert.equal(await resolveTransactionChargeCurrency(fake(null), "b1", "mxn"), "MXN");
});

test("no explicit currency reads the booking's own", async () => {
  assert.equal(await resolveTransactionChargeCurrency(fake({ currency_code: "MXN" }), "b1", undefined), "MXN");
});

test("an unreadable or blank booking currency fails closed (null), never USD", async () => {
  assert.equal(await resolveTransactionChargeCurrency(fake({ currency_code: null }), "b1", null), null);
  assert.equal(await resolveTransactionChargeCurrency(fake(null), "b1", ""), null);
  assert.equal(await resolveTransactionChargeCurrency(fake(null, { message: "boom" }), "b1", undefined), null);
});
