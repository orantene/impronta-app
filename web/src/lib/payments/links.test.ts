import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPaymentLink, loadPaymentLinkByCode, markPaymentLinkPaid } from "./links";
import { fakeAdmin, makeStore, type Row } from "@/lib/pos/__fixtures__/pos-store";

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

// D-145: the link carries the conversation it was requested from, so the pay
// page can lead back to it when the order itself does not name one.
test("loadPaymentLinkByCode reads the link's inquiry", async () => {
  const admin = {
    from: () => {
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({
          data: {
            tenant_id: "t1",
            order_id: "o1",
            amount_cents: 1800,
            status: "open",
            provider: "mock",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            inquiry_id: "inq-1",
          },
          error: null,
        }),
      };
      return api;
    },
  };
  const loaded = await loadPaymentLinkByCode(admin as never, "abcdefgh");
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.inquiryId, "inq-1");
});

test("a Messages payment request names its conversation on the link AND the order at mint time (D-150)", async () => {
  const store = makeStore();
  store.orders.push({ id: "o1", tenant_id: "t1", status: "pending_payment", currency: "USD", total_cents: 5000, version: 1, inquiry_id: null });
  const admin = fakeAdmin(store);
  const minted = await createPaymentLink(admin, {
    tenantId: "t1",
    orderId: "o1",
    amountCents: 2500,
    idempotencyKey: "msg-request-1",
    actorUserId: "0f3c6b7a-2d1e-4c5b-9a8f-7e6d5c4b3a21",
    publicOrigin: "https://elpaisa.example",
    inquiryId: "inq-1",
  });
  assert.equal(minted.ok, true, JSON.stringify(minted));
  if (!minted.ok) return;
  const link = ((store as Record<string, Row[]>).payment_links ?? []).find((l) => l.code === minted.code);
  assert.equal(link?.inquiry_id, "inq-1");
  assert.equal(store.orders[0].inquiry_id, "inq-1");

  // The loader exposes it while the link is open...
  const open = await loadPaymentLinkByCode(admin, minted.code);
  assert.equal(open.ok, true);
  if (open.ok) assert.equal(open.inquiryId, "inq-1");

  // ...and still once it has lapsed: the expired pay view leads back to the thread.
  link!.expires_at = new Date(Date.now() - 1000).toISOString();
  const lapsed = await loadPaymentLinkByCode(admin, minted.code);
  assert.equal(lapsed.ok, false);
  if (!lapsed.ok) {
    assert.equal(lapsed.reason, "expired");
    if (lapsed.reason === "expired") {
      assert.equal(lapsed.inquiryId, "inq-1");
      assert.equal(lapsed.orderId, "o1");
      assert.equal(lapsed.tenantId, "t1");
    }
  }
});

test("the mint leaves an order that already belongs to another conversation alone", async () => {
  const store = makeStore();
  store.orders.push({ id: "o1", tenant_id: "t1", status: "pending_payment", currency: "USD", total_cents: 5000, version: 1, inquiry_id: "inq-older" });
  const admin = fakeAdmin(store);
  const minted = await createPaymentLink(admin, {
    tenantId: "t1",
    orderId: "o1",
    amountCents: 2500,
    idempotencyKey: "msg-request-2",
    actorUserId: "0f3c6b7a-2d1e-4c5b-9a8f-7e6d5c4b3a21",
    publicOrigin: "https://elpaisa.example",
    inquiryId: "inq-new",
  });
  assert.equal(minted.ok, true, JSON.stringify(minted));
  assert.equal(store.orders[0].inquiry_id, "inq-older");
  const link = ((store as Record<string, Row[]>).payment_links ?? [])[0];
  assert.equal(link?.inquiry_id, "inq-new");
});

// A2 / #14: an expired operation key must not block a re-request with the same key.
test("createPaymentLink frees an expired key and mints a new open link", async () => {
  const store = makeStore();
  store.orders.push({
    id: "o1",
    tenant_id: "t1",
    status: "pending_payment",
    currency: "USD",
    total_cents: 5000,
    version: 1,
    inquiry_id: null,
  });
  (store as Record<string, Row[]>).payment_links = [
    {
      id: "old-1",
      tenant_id: "t1",
      order_id: "o1",
      code: "oldcode01",
      amount_cents: 1800,
      currency: "USD",
      status: "expired",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      operation_key: "stable-key-aaaa",
      reservation_id: "res-old",
      created_by: null,
      inquiry_id: null,
    },
  ];
  const admin = fakeAdmin(store);
  const minted = await createPaymentLink(admin, {
    tenantId: "t1",
    orderId: "o1",
    amountCents: 1800,
    idempotencyKey: "stable-key-aaaa",
    actorUserId: "0f3c6b7a-2d1e-4c5b-9a8f-7e6d5c4b3a21",
    publicOrigin: "https://elpaisa.example",
  });
  assert.equal(minted.ok, true, JSON.stringify(minted));
  if (!minted.ok) return;
  assert.notEqual(minted.code, "oldcode01");
  const links = (store as Record<string, Row[]>).payment_links ?? [];
  const old = links.find((l) => l.code === "oldcode01");
  const neu = links.find((l) => l.code === minted.code);
  assert.ok(String(old?.operation_key ?? "").includes(":was:expired:"));
  assert.equal(neu?.operation_key, "stable-key-aaaa");
  assert.equal(neu?.status, "open");
});
