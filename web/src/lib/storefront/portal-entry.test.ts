import assert from "node:assert/strict";
import { test } from "node:test";

import { actPortalEntryCore, readPortalEntryCore, type PortalEntryDeps } from "./portal-entry.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";

const TENANT = uuid(1);
const USER = uuid(2);
const CUST = uuid(3);

function setup(over: Partial<PortalEntryDeps> = {}) {
  const { admin } = fakeAdmin({
    customers: [{ id: CUST, tenant_id: TENANT, user_id: USER }],
    orders: [
      { id: uuid(10), tenant_id: TENANT, customer_id: CUST, receipt_code: "R1", status: "paid", total_cents: 500, currency: "USD", created_at: "2026-09-10T00:00:00Z" },
      { id: uuid(11), tenant_id: TENANT, customer_id: CUST, receipt_code: null, status: "draft", total_cents: 0, currency: "USD", created_at: "2026-09-11T00:00:00Z" },
    ],
    admissions: [{ id: uuid(20), tenant_id: TENANT, token_version: 2, holder_name: "Ana", holder_email: "ana@example.com", session_id: uuid(30), starts_at: "2026-09-20T20:00:00Z", status: "issued" }],
  });
  const deps: PortalEntryDeps = {
    admin,
    identity: { guestKey: "g", userId: USER, email: "Ana@Example.com", displayName: "Ana" },
    locale: "en",
    loadMe: async () => ({
      upcoming: [{ id: uuid(40), tenantId: TENANT, status: "confirmed", title: "Cut", eventDate: "2026-09-18", eventLocation: null, createdAt: "2026-09-01", nextActionBy: null, booking: null, kind: "upcoming" }],
      waitingOnYou: [],
      past: [],
      isEmpty: false,
    }),
    signAdmissionToken: (id, v) => `tkt-${id.slice(-2)}-v${v}`,
    requestCode: async (form) => ({ step: "sent", email: String(form.get("email")), notice: "Check your inbox." }),
    ...over,
  };
  return { deps };
}

test("read: signed out points at /me; signed in lists bookings, tickets by holder e-mail, settled orders", async () => {
  const { deps } = setup({ identity: { guestKey: "g", userId: null, email: null, displayName: null } });
  assert.deepEqual(await readPortalEntryCore(deps, TENANT, { label: "My account" }), { ok: true, data: { signedIn: false, label: "My account", signInPath: "/me" } });
  const { deps: signedIn } = setup();
  const r = await readPortalEntryCore(signedIn, TENANT, {});
  assert.ok(r.ok && r.data.signedIn);
  if (!r.ok || !r.data.signedIn) return;
  assert.deepEqual(r.data.customer, { name: "Ana", email: "Ana@Example.com" });
  assert.deepEqual(r.data.bookings.map((b) => [b.title, b.kind, b.path]), [["Cut", "upcoming", `/c/${uuid(40)}`]]);
  assert.deepEqual(r.data.tickets.map((t) => t.code), [`tkt-${uuid(20).slice(-2)}-v2`]);
  assert.deepEqual(r.data.orders.map((o) => [o.receiptCode, o.status]), [["R1", "paid"]], "a draft cart is not an order");
  assert.equal(r.data.portalPath, "/me");
});

test("act request_code: feeds the OTP flow's own form; its refusal sentence is kept", async () => {
  const { deps } = setup();
  const sent = await actPortalEntryCore(deps, { op: "request_code", tenantId: TENANT, email: "Ana@Example.com" });
  assert.deepEqual(sent, { ok: true, op: "request_code", email: "ana@example.com", notice: "Check your inbox." });
  const bad = await actPortalEntryCore(deps, { op: "request_code", tenantId: TENANT, email: "nope" });
  assert.ok(!bad.ok && bad.code === "invalid");
  const { deps: limited } = setup({ requestCode: async () => ({ step: "email", error: "Too many codes. Wait a minute." }) });
  const r = await actPortalEntryCore(limited, { op: "request_code", tenantId: TENANT, email: "ana@example.com" });
  assert.ok(!r.ok && r.reason === "refused" && r.message === "Too many codes. Wait a minute.");
});
