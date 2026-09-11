import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPaymentLink } from "./links";

test("createPaymentLink refuses a non-positive amount without reserving", async () => {
  let reserved = false;
  const result = await createPaymentLink(
    {
      from: () => {
        throw new Error("no table");
      },
      rpc: async () => {
        reserved = true;
        return { data: { ok: true }, error: null };
      },
    },
    {
      tenantId: "t1",
      orderId: "o1",
      amountCents: 0,
      idempotencyKey: "link-aaaaaa",
      actorUserId: "u1",
      publicOrigin: "https://impronta.tulala.digital",
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid");
  assert.equal(reserved, false);
});

test("payment links SQL reaps expired open links and releases the reservation", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231205000_payment_links.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.payment_links/);
  assert.match(sql, /reap_payment_links/);
  assert.match(sql, /pos_settle_collection_reservation/);
  assert.match(sql, /'link'/);
});
