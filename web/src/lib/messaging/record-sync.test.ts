/**
 * S2: `syncConversationRecord` is the only bridge from a POS writer to
 * `conversation_records`. It calls the RPC with the exact argument names the
 * migration declares, maps the jsonb reply, and never throws — a broken
 * bridge must not break the sale that just succeeded.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { syncConversationRecord } from "./record-sync";

const TENANT = uuid(1);
const ORDER = uuid(2);

test("calls messaging_sync_record_state with p_tenant / p_record_kind / p_record_id and maps the reply", async () => {
  const { admin, calls } = fakeAdmin(
    {},
    {
      messaging_sync_record_state: () => ({
        ok: true,
        linked: 2,
        payment_state: "paid",
        fulfilment_state: "preparing",
        record_date: "2026-09-18T19:00:00+00:00",
      }),
    },
  );
  const result = await syncConversationRecord(admin, { tenantId: TENANT, kind: "order", recordId: ORDER });
  assert.deepEqual(result, {
    ok: true,
    linked: 2,
    paymentState: "paid",
    fulfilmentState: "preparing",
    recordDate: "2026-09-18T19:00:00+00:00",
  });
  assert.deepEqual(calls, [
    {
      rpc: "messaging_sync_record_state",
      op: "rpc",
      args: { p_tenant: TENANT, p_record_kind: "order", p_record_id: ORDER },
    },
    // D-MSG-338: a settled payment state also mirrors onto the thread's
    // Payment card, which starts by reading the record's linked inquiries.
    { op: "select", table: "conversation_records" },
  ]);
});

test("a record with no inquiry links is ok with linked 0 (nothing to write is not a failure)", async () => {
  const { admin } = fakeAdmin(
    {},
    { messaging_sync_record_state: () => ({ ok: true, linked: 0, payment_state: "paid", fulfilment_state: "none" }) },
  );
  const result = await syncConversationRecord(admin, { tenantId: TENANT, kind: "order", recordId: ORDER });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.linked, 0);
  assert.equal(result.recordDate, null);
});

test("an RPC error, a thrown handler and a missing RPC all return unavailable, never throw", async () => {
  const silence = console.error;
  console.error = () => {};
  try {
    const missing = fakeAdmin({}, {});
    assert.deepEqual(
      await syncConversationRecord(missing.admin, { tenantId: TENANT, kind: "order", recordId: ORDER }),
      { ok: false, reason: "unavailable" },
    );
    const thrown = fakeAdmin(
      {},
      {
        messaging_sync_record_state: () => {
          throw new Error("boom");
        },
      },
    );
    assert.deepEqual(
      await syncConversationRecord(thrown.admin, { tenantId: TENANT, kind: "tickets", recordId: ORDER }),
      { ok: false, reason: "unavailable" },
    );
    const exploding = {
      rpc: () => {
        throw new Error("network");
      },
    };
    assert.deepEqual(
      await syncConversationRecord(exploding as never, { tenantId: TENANT, kind: "order", recordId: ORDER }),
      { ok: false, reason: "unavailable" },
    );
  } finally {
    console.error = silence;
  }
});

test("the RPC's own refusals pass through as reasons; an unknown kind is refused before any call", async () => {
  const { admin, calls } = fakeAdmin({}, { messaging_sync_record_state: () => ({ ok: false, reason: "not_found" }) });
  assert.deepEqual(await syncConversationRecord(admin, { tenantId: TENANT, kind: "appointment", recordId: ORDER }), {
    ok: false,
    reason: "not_found",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(
    await syncConversationRecord(admin, { tenantId: TENANT, kind: "offer" as never, recordId: ORDER }),
    { ok: false, reason: "invalid" },
  );
  assert.equal(calls.length, 1);
});
