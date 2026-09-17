/**
 * S5 (Messages v5, D-MSG-30): a draft line knows who proposed it and the
 * price it was added at, staff confirm it, and a later catalog change never
 * touches it. Runs the fallback (no-RPC) path of `draft.ts` against the
 * in-memory store; the RPC's own copy of the rules is proven by the DO block
 * in `20261231260000_line_author_confirmation_snapshot.sql`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { addLine, confirmLines, createDraftOrder, updateLine } from "./draft";
import { fakeAdmin, makeStore, seedOffering } from "./__fixtures__/commands-store";

async function draftWithOffering() {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  return { store, orderId: created.orderId };
}

test("a line is staff's unless the caller says otherwise, and carries the price it was added at", async () => {
  const { store, orderId } = await draftWithOffering();
  const added = await addLine(fakeAdmin(store), { tenantId: "t1", orderId, line: { offeringId: "off-1", units: 1 } });
  assert.equal(added.ok, true);
  const line = store.order_lines[0];
  assert.equal(line.proposed_by, "staff");
  assert.equal(line.price_snapshot_cents, 5000);
  assert.equal(line.catalog_price_cents_at_add, 5000);
  assert.equal(line.discount_cents, 0);
  assert.equal(line.tax_cents, 0);
  assert.equal(line.confirmed_at, undefined);
});

test("the guest link's add is the client's", async () => {
  const { store, orderId } = await draftWithOffering();
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId,
    line: { offeringId: "off-1", units: 2 },
    proposedBy: "client",
  });
  assert.equal(added.ok, true);
  assert.equal(store.order_lines[0].proposed_by, "client");
});

test("a catalog change after the add leaves the line's price and snapshot alone (D-MSG-30)", async () => {
  const { store, orderId } = await draftWithOffering();
  await addLine(fakeAdmin(store), { tenantId: "t1", orderId, line: { offeringId: "off-1", units: 1 } });
  store.talent_offerings[0].amount_cents = 6500;
  const updated = await updateLine(fakeAdmin(store), { tenantId: "t1", orderId, lineId: String(store.order_lines[0].id), units: 3 });
  assert.equal(updated.ok, true);
  assert.equal(store.order_lines[0].unit_cents, 5000);
  assert.equal(store.order_lines[0].price_snapshot_cents, 5000);
  assert.equal(store.order_lines[0].total_cents, 15000);
  // A second add after the change is priced at the new catalog price with its own snapshot.
  await addLine(fakeAdmin(store), { tenantId: "t1", orderId, line: { offeringId: "off-1", units: 1 } });
  assert.equal(store.order_lines[1].unit_cents, 6500);
  assert.equal(store.order_lines[1].price_snapshot_cents, 6500);
  assert.equal(store.order_lines[0].price_snapshot_cents, 5000);
});

test("staff confirm a client's lines; a second confirmation is idempotent; a client cannot confirm", async () => {
  const { store, orderId } = await draftWithOffering();
  await addLine(fakeAdmin(store), { tenantId: "t1", orderId, line: { offeringId: "off-1", units: 1 }, proposedBy: "client" });
  const lineId = String(store.order_lines[0].id);
  const refused = await confirmLines(fakeAdmin(store), { tenantId: "t1", orderId, lineIds: [lineId], actor: { kind: "client", id: null } });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.reason, "invalid");
  assert.equal(store.order_lines[0].confirmed_at, undefined);

  const confirmed = await confirmLines(fakeAdmin(store), { tenantId: "t1", orderId, lineIds: [lineId], actor: { kind: "staff", id: "u1" } });
  assert.equal(confirmed.ok, true);
  if (confirmed.ok) assert.deepEqual(confirmed.confirmedLineIds, [lineId]);
  assert.equal(typeof store.order_lines[0].confirmed_at, "string");
  assert.equal(store.order_lines[0].confirmed_by, "u1");
  const firstStamp = store.order_lines[0].confirmed_at;

  const again = await confirmLines(fakeAdmin(store), { tenantId: "t1", orderId, lineIds: [lineId], actor: { kind: "staff", id: "u2" } });
  assert.equal(again.ok, true);
  if (again.ok) assert.deepEqual(again.confirmedLineIds, []);
  assert.equal(store.order_lines[0].confirmed_at, firstStamp);
  assert.equal(store.order_lines[0].confirmed_by, "u1");

  const missing = await confirmLines(fakeAdmin(store), { tenantId: "t1", orderId, lineIds: ["nope"], actor: { kind: "staff", id: "u1" } });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "not_found");
});

test("confirmLines is tenant-scoped", async () => {
  const { store, orderId } = await draftWithOffering();
  await addLine(fakeAdmin(store), { tenantId: "t1", orderId, line: { offeringId: "off-1", units: 1 }, proposedBy: "client" });
  const other = await confirmLines(fakeAdmin(store), {
    tenantId: "t2",
    orderId,
    lineIds: [String(store.order_lines[0].id)],
    actor: { kind: "staff", id: "u1" },
  });
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.reason, "wrong_tenant");
});

test("the RPC payload names the author and the snapshot, and the Messages writers name theirs", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/pos/draft.ts"), "utf8");
  const addFn = src.slice(src.indexOf("export async function addLine"), src.indexOf("export async function updateLine"));
  assert.match(addFn, /proposed_by: proposedBy/);
  assert.match(addFn, /price_snapshot_cents: unitCents/);
  assert.match(addFn, /catalog_price_cents_at_add: catalogCents/);
  // Only the reprice command rewrites unit_cents; it never writes the snapshot.
  const reprice = src.slice(src.indexOf("export async function repriceAndValidate"));
  assert.doesNotMatch(reprice, /price_snapshot_cents/);

  const engine = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-engine.ts"), "utf8");
  const guest = engine.slice(engine.indexOf("export async function messagingGuestDraftAdd"));
  const guestBody = guest.slice(0, guest.indexOf("\nexport async function", 10));
  assert.match(guestBody, /proposedBy: "client"/);
  const options = engine.slice(engine.indexOf("export async function messagingSendOptions"));
  const optionsBody = options.slice(0, options.indexOf("\nexport async function", 10));
  assert.match(optionsBody, /proposedBy: "staff"/);

  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231260000_line_author_confirmation_snapshot.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.pos_mutate_draft_line/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.order_line_events/);
  assert.match(sql, /CREATE TRIGGER order_lines_write_event/);
});
