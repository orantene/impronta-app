/**
 * L53 commands that take money and close a sale, split out of
 * `commands.test.ts` when that file passed the 800-line budget. This half
 * covers `startCollection`, `submitToPreparation`, `finalizeOrCancel` and the
 * identity/version/capacity refusals around them; draft building and line
 * mutation live in the sibling `commands-draft.test.ts`. The shared fake
 * store moved to `__fixtures__/commands-store.ts` so neither half has to
 * carry it alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addLine, createDraftOrder } from "./draft";
import { admissionHoldersFromDeskContact } from "./admission-holders";
import { finalizeOrCancel, startCollection, submitToPreparation } from "./collection";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeAdmin, fakeTill, makeStore, seedOffering } from "./__fixtures__/commands-store";

test("an anonymous paid cash walk-in collects, and the receipt code is the anchor", async () => {
  // MONEY DOES NOT REQUIRE A NAME. This used to refuse: nobody asks a counter
  // for an email before selling a manicure, and `customers_has_a_key` forbids
  // inventing a blank walk-in to satisfy the old CHECK.
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const r = await startCollection(fakeTill(store), {
    tenantId: "t1",
    orderId: created.orderId,
    actorUserId: "u1",
    method: "cash",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
    idempotencyKey: "pos-cash:commands",
  });
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.equal(r.method, "cash");
  assert.equal(store.orders[0].customer_id, null, "no invented contact");
  assert.ok(store.orders[0].guest_session_id, "the guest session stays on the row");
  const code = store.orders[0].receipt_code as string;
  assert.ok(code && code.length >= 16, "the receipt code is what retrieves this sale at /r/<code>");
});

test("a line whose offering needs attendee names refuses, and says why", async () => {
  const store = makeStore();
  seedOffering(store, {
    title: "Gala Dinner",
    requires_identity: true,
    identity_reason: "attendee_names",
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const r = await startCollection(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    actorUserId: "u1",
    method: "cash",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
    idempotencyKey: "pos-cash:gala-no-contact",
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "no_contact");
  assert.match(r.error, /Gala Dinner/, "the refusal names the offering");
  assert.match(r.error, /name for every attendee/, "the refusal says why");
  assert.equal(store.booking_transactions.length, 0);
});

test("desk contact becomes mint holders so the ticket is not unnamed", () => {
  assert.deepEqual(admissionHoldersFromDeskContact({ units: 2, displayName: "Ana Ruiz" }), [
    { name: "Ana Ruiz", email: null },
    { name: "Ana Ruiz", email: null },
  ]);
  assert.equal(admissionHoldersFromDeskContact({ units: 1, displayName: "  " }), undefined);
});

test("a named-ticket walk-in collects when the operator typed the attendee name", async () => {
  const store = makeStore();
  seedOffering(store, {
    title: "Gala Dinner",
    requires_identity: true,
    identity_reason: "attendee_names",
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const r = await startCollection(
    fakeTill(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "u1",
      method: "cash",
      contact: { displayName: "Ana Ruiz" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      idempotencyKey: "pos-cash:gala-named",
    },
    {
      holdCapacity: async () => ({ ok: true, allocationIds: [], holdIds: [], skipped: true }),
    },
  );
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.equal(store.orders[0].customer_id, null, "a desk name is not a customer row");
});

test("submitToPreparation writes a ticket instead of returning not_built", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const r = await submitToPreparation(fakeAdmin(store), { tenantId: "t1", orderId: created.orderId });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.revision, 1);
  assert.equal(store.preparation_tickets.length, 1);
});

test("POS actions do not call createPurchase", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/actions.ts"), "utf8");
  assert.doesNotMatch(src, /createPurchase/);
  const collection = readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8");
  assert.match(collection, /holdDraftOrderCapacity/);
  assert.doesNotMatch(collection, /createPurchase/);
});

test("cash collection with contact records a settle, not a purchase", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const orderId = created.orderId;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  let settled = 0;
  const r = await startCollection(
    fakeTill(store),
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact: { email: "walkin@example.com" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      idempotencyKey: "pos-cash:walkin",
    },
    {
      ensureCustomer: async () => ({
        ok: true,
        customerId: "cust-walkin",
        created: true,
        identity: { email: "walkin@example.com", phoneE164: null, displayName: null },
      }),
      settle: async () => {
        settled += 1;
        return { ok: true, orderId, transactionId: "txn-cash", alreadySettled: false };
      },
    },
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.method, "cash");
  assert.equal(settled, 1);
  assert.equal(store.orders[0].customer_id, "cust-walkin");
});

test("collect refuses when the class place is sold out and does not settle", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  let settled = 0;
  const r = await startCollection(
    fakeTill(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "u1",
      method: "cash",
      contact: { email: "walkin@example.com" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      idempotencyKey: "pos-cash:walkin",
    },
    {
      ensureCustomer: async () => ({
        ok: true,
        customerId: "cust-walkin",
        created: true,
        identity: { email: "walkin@example.com", phoneE164: null, displayName: null },
      }),
      settle: async () => {
        settled += 1;
        return { ok: true, orderId: created.orderId, transactionId: "txn-cash", alreadySettled: false };
      },
      holdCapacity: async () => ({ ok: false, reason: "sold_out", error: "That is no longer free." }),
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "sold_out");
  assert.equal(settled, 0);
});

test("cancelling a draft releases held class places", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const lineId = String(store.order_lines[0].id);
  store.capacity_allocations.push({
    id: "alloc-1",
    tenant_id: "t1",
    order_line_id: lineId,
    released_at: null,
  });
  store.capacity_allocations.push({
    id: "alloc-foreign",
    tenant_id: "t2",
    order_line_id: lineId,
    released_at: null,
  });
  const released: string[] = [];
  const r = await finalizeOrCancel(
    fakeAdmin(store),
    { tenantId: "t1", orderId: created.orderId },
    {
      release: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
    },
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.status, "cancelled");
  assert.deepEqual(released, ["alloc-1"]);
  assert.equal(store.orders[0].status, "cancelled");
});

test("cancelling a sale withdraws its ticket from the station board", async () => {
  // Seen on the QA host: a cancelled counter sale's ticket stayed queued (and
  // then acknowledged) on the kitchen board, six times over. Nothing called
  // `cancelTicket`. A sale that has ended is food that is not to be made.
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const sent = await submitToPreparation(fakeAdmin(store), { tenantId: "t1", orderId: created.orderId });
  assert.equal(sent.ok, true);
  assert.equal(store.preparation_tickets[0]?.status, "queued");

  const r = await finalizeOrCancel(
    fakeAdmin(store),
    { tenantId: "t1", orderId: created.orderId },
    { release: async (ids) => ({ ok: true, released: ids.length, alreadyReleased: 0 }) },
  );
  assert.equal(r.ok, true);
  assert.equal(store.orders[0].status, "cancelled");
  assert.equal(store.preparation_tickets[0]?.status, "cancelled");
  assert.ok(store.preparation_tickets[0]?.cancelled_at, "the withdrawal is stamped");
});

test("cancelling another workspace's sale writes nothing", async () => {
  const store = makeStore();
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t2", actorUserId: "u2" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  store.capacity_allocations.push({
    id: "alloc-2",
    tenant_id: "t2",
    order_line_id: "line-x",
    released_at: null,
  });
  let released = 0;
  const r = await finalizeOrCancel(
    fakeAdmin(store),
    { tenantId: "t1", orderId: created.orderId },
    {
      release: async () => {
        released += 1;
        return { ok: true, released: 1, alreadyReleased: 0 };
      },
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "wrong_tenant");
  assert.equal(released, 0);
  assert.equal(store.orders[0].status, "draft");
});

test("two operators writing the same expectedVersion conflict", async () => {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const first = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    expectedVersion: 1,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(first.ok, true);
  const second = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    expectedVersion: 1,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.reason, "conflict");
});

test("cancelling a draft whose allocation read fails is not a successful release", async () => {
  const store = makeStore();
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  store.order_lines.push({ id: "line-1", order_id: created.orderId, tenant_id: "t1" });
  const admin = fakeAdmin(store);
  const origFrom = admin.from;
  admin.from = (table: string) => {
    const api = origFrom(table) as Record<string, unknown> & {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => unknown;
    };
    if (table === "capacity_allocations") {
      api.then = (resolve) =>
        Promise.resolve({ data: null, error: { message: "read failed" } }).then(resolve);
    }
    return api;
  };
  let released = 0;
  const r = await finalizeOrCancel(
    admin,
    { tenantId: "t1", orderId: created.orderId },
    {
      release: async () => {
        released += 1;
        return { ok: true, released: 1, alreadyReleased: 0 };
      },
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "unavailable");
  assert.equal(released, 0);
});

test("zero-total collect without contact is allowed for a guest-session draft", async () => {
  const store = makeStore();
  seedOffering(store, { amount_cents: 0 });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const r = await startCollection(fakeTill(store), {
    tenantId: "t1",
    orderId: created.orderId,
    actorUserId: "u1",
    method: "cash",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
    idempotencyKey: "pos-cash:commands",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.method, "cash");
  if (r.method !== "cash") return;
  assert.equal(r.amountCents, 0);
  assert.equal(store.orders[0].status, "paid");
  assert.equal(store.orders[0].customer_id, null, "no invented contact");
  assert.ok(store.orders[0].guest_session_id, "guest session remains the identity");
  assert.equal(store.booking_transactions.length, 0, "no fabricated charge");
});

test("a FREE sale of an identity-bound item is refused too", async () => {
  // Price is not the question. A complimentary ticket still needs the
  // attendee's name; the old rule asked about money and never about this.
  const store = makeStore();
  seedOffering(store, {
    amount_cents: 0,
    title: "Comp Gala Seat",
    requires_identity: true,
    identity_reason: "attendee_names",
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  const r = await startCollection(fakeTill(store), {
    tenantId: "t1",
    orderId: created.orderId,
    actorUserId: "u1",
    method: "cash",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
    idempotencyKey: "pos-cash:commands",
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "no_contact");
  assert.match(r.error, /Comp Gala Seat/);
});

test("zero-total collect does not fabricate a charge", async () => {
  const store = makeStore();
  seedOffering(store, { amount_cents: 0 });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  let paidHook = 0;
  const r = await startCollection(
    fakeTill(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "u1",
      method: "cash",
      contact: { email: "free@example.com" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      idempotencyKey: "pos-free:zero",
    },
    {
      ensureCustomer: async () => ({
        ok: true as const,
        customerId: "cust-free",
        created: true,
        identity: { email: "free@example.com", phoneE164: null, displayName: null },
      }),
      holdCapacity: async () => ({ ok: true, allocationIds: [], holdIds: [], skipped: true }),
      onOrderPaid: async () => {
        paidHook += 1;
      },
    },
  );
  assert.equal(r.ok, true);
  assert.equal(store.booking_transactions.length, 0);
  assert.equal(store.orders[0].status, "paid");
  assert.equal(paidHook, 1);
  assert.equal(
    store.booking_transactions.some((row) => String(row.id).includes("zero-collect")),
    false,
  );
});

