import assert from "node:assert/strict";
import { test } from "node:test";

import { actOrderLookupCore, readOrderLookupCore, type OrderLookupDeps } from "./order-lookup.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";

const TENANT = uuid(1);
const ORDER = uuid(2);
const CUST = uuid(3);
const ADM = uuid(4);

function setup(over: Partial<OrderLookupDeps> = {}) {
  const { admin } = fakeAdmin({
    orders: [{ id: ORDER, tenant_id: TENANT, receipt_code: "RCPT9876", status: "paid", total_cents: 4200, currency: "USD", created_at: "2026-09-10T10:00:00Z", customer_id: CUST }],
    customers: [{ id: CUST, email: "ana@example.com" }],
    order_lines: [{ id: uuid(20), order_id: ORDER, label: "GA ticket", units: 2, total_cents: 4200, sort_order: 0 }],
    admissions: [
      { id: ADM, tenant_id: TENANT, order_line_id: uuid(20), token_version: 1, holder_name: "Bob", holder_email: "bob@example.com", session_id: uuid(30), starts_at: "2026-09-20T20:00:00Z", status: "issued" },
      { id: uuid(5), tenant_id: TENANT, order_line_id: uuid(20), token_version: 1, holder_name: "Ana", holder_email: "ana@example.com", session_id: uuid(30), starts_at: "2026-09-20T20:00:00Z", status: "issued" },
    ],
  });
  const deps: OrderLookupDeps = {
    admin,
    locale: "en",
    ticketLookup: async () => ({ ok: true, codes: ["tkt-bob"] }),
    loadTicketByCode: async (_a, i) => ({ ok: true, admissionId: ADM, holderName: "Bob", holderEmail: "bob@example.com", startsAt: "2026-09-20T20:00:00Z", sessionId: uuid(30), status: "issued", code: i.code }),
    ticketResend: async () => ({ ok: true }),
    ticketTransfer: async (_a, i) => ({ ok: true, code: `${i.code}-v2` }),
    signAdmissionToken: (id) => `tkt-${id.slice(-2)}`,
    ...over,
  };
  return { deps };
}

test("read: nothing until code + e-mail; the buyer sees the order and their own tickets only", async () => {
  const { deps } = setup();
  const idle = await readOrderLookupCore(deps, TENANT, { title: "Find my order" });
  assert.deepEqual(idle, { ok: true, data: { title: "Find my order", result: null } });
  const r = await readOrderLookupCore(deps, TENANT, { code: "RCPT9876", email: "Ana@Example.com" });
  assert.ok(r.ok);
  if (!r.ok) return;
  const order = r.data.result!.order!;
  assert.equal(order.receiptCode, "RCPT9876");
  assert.equal(order.path, "/r/RCPT9876");
  assert.equal(order.totalCents, 4200);
  assert.deepEqual(order.lines, [{ label: "GA ticket", units: 2, totalCents: 4200 }]);
  assert.deepEqual(r.data.result!.tickets.map((t) => t.holderName), ["Ana"], "Bob's ticket is not Ana's to see");
});

test("read: a stranger's e-mail is not_found; a holder who is not the buyer sees the order via their ticket; last-4 falls back to the ticket engine", async () => {
  const { deps } = setup();
  const stranger = await readOrderLookupCore(deps, TENANT, { code: "RCPT9876", email: "eve@example.com" });
  assert.deepEqual(stranger, { ok: false, reason: "not_found" });
  const bob = await readOrderLookupCore(deps, TENANT, { code: "RCPT9876", email: "bob@example.com" });
  assert.ok(bob.ok && bob.data.result!.order && bob.data.result!.tickets.length === 1);
  const last4 = await readOrderLookupCore(deps, TENANT, { code: "9876", email: "bob@example.com" });
  assert.ok(last4.ok && last4.data.result!.order === null && last4.data.result!.tickets[0]!.code === "tkt-bob");
  const { deps: limited } = setup({ ticketLookup: async () => ({ ok: false, reason: "too_many_attempts" }) });
  assert.deepEqual(await readOrderLookupCore(limited, TENANT, { code: "9876", email: "x@y.co" }), { ok: false, reason: "too_many_attempts" });
});

test("act: resend and transfer go through the ticket page's functions; refusals map", async () => {
  const { deps } = setup();
  assert.deepEqual(await actOrderLookupCore(deps, { op: "resend", tenantId: TENANT, code: "tkt-abcdef" }), { ok: true, op: "resend" });
  const t = await actOrderLookupCore(deps, { op: "transfer", tenantId: TENANT, code: "tkt-abcdef", toName: "Cy", toEmail: "cy@example.com" });
  assert.deepEqual(t, { ok: true, op: "transfer", code: "tkt-abcdef-v2", path: "/ticket/tkt-abcdef-v2" });
  const noName = await actOrderLookupCore(deps, { op: "transfer", tenantId: TENANT, code: "tkt-abcdef", toName: "", toEmail: "cy@example.com" });
  assert.ok(!noName.ok && noName.reason === "identity_required");
  const { deps: gone } = setup({ ticketResend: async () => ({ ok: false, reason: "superseded" }) });
  const r = await actOrderLookupCore(gone, { op: "resend", tenantId: TENANT, code: "tkt-abcdef" });
  assert.ok(!r.ok && r.reason === "conflict" && r.code === "superseded");
});
