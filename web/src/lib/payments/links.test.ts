import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPaymentLink, markPaymentLinkPaid } from "./links";

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

function linkAdmin(link: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "payment_links");
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: link, error: null }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: () => ({ eq: async () => ({ data: null, error: null }) }) };
        },
      };
      return api;
    },
    rpc: async () => ({ data: { ok: true }, error: null }),
  };
  return { admin, updates };
}

const openLink = {
  id: "link-1",
  tenant_id: "t1",
  order_id: "o1",
  amount_cents: 1800,
  currency: "usd",
  created_by: "u1",
  operation_key: "paylink:o1:3:1800",
  status: "open",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  reservation_id: "res-1",
};

// D-135: a paid link used to flip its own status and stop; the sale stayed
// draft with no money row. Now it collects the sale on the reservation the
// link holds, and only then reads paid.
test("markPaymentLinkPaid collects the sale on the link's reservation before flipping the link", async () => {
  const { admin, updates } = linkAdmin(openLink);
  const settles: Array<Record<string, unknown>> = [];
  const result = await markPaymentLinkPaid(
    admin as never,
    { code: "abcdefgh", tenantId: "t1" },
    {
      settle: async (_admin, input) => {
        settles.push(input as unknown as Record<string, unknown>);
        return { ok: true, orderId: input.orderId, transactionId: "txn-1", alreadySettled: false };
      },
    },
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(settles.length, 1);
  assert.equal(settles[0].orderId, "o1");
  assert.equal(settles[0].amountCents, 1800);
  assert.equal(settles[0].reservationId, "res-1");
  assert.equal(settles[0].idempotencyKey, "paylink:o1:3:1800");
  assert.equal(settles[0].paidVia, "card");
  assert.deepEqual(updates, [{ status: "paid" }]);
});

test("markPaymentLinkPaid leaves the link open when the sale could not be collected", async () => {
  const { admin, updates } = linkAdmin(openLink);
  const result = await markPaymentLinkPaid(
    admin as never,
    { code: "abcdefgh", tenantId: "t1" },
    { settle: async () => ({ ok: false, reason: "unavailable" }) },
  );
  assert.deepEqual(result, { ok: false, reason: "unavailable" });
  assert.deepEqual(updates, []);
});

test("markPaymentLinkPaid on an already-paid link collects nothing twice", async () => {
  const { admin, updates } = linkAdmin({ ...openLink, status: "paid" });
  let settles = 0;
  const result = await markPaymentLinkPaid(
    admin as never,
    { code: "abcdefgh", tenantId: "t1" },
    {
      settle: async () => {
        settles += 1;
        return { ok: false, reason: "unavailable" };
      },
    },
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(settles, 0);
  assert.deepEqual(updates, []);
});
