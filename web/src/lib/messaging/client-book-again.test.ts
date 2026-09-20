import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { fakeAdmin, makeStore, seedOffering } from "@/lib/pos/__fixtures__/commands-store";

import { bookAgainFromRecord } from "./client-book-again";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

const TENANT = "t1";
const OLD = "inq-old";
const NEW = "inq-new";
const ORDER = "ord-old";
const OWNER = "owner-1";

function seed() {
  const store = makeStore();
  seedOffering(store);
  (store as Record<string, unknown[]>).inquiries = [
    {
      id: OLD,
      tenant_id: TENANT,
      contact_name: "Ana Ruiz",
      contact_email: "ana@example.com",
      contact_phone: "+15555550100",
      client_user_id: null,
      guest_session_id: "guest-1",
      owner_user_id: OWNER,
      event_date: "2026-09-20",
      event_location: "Austin",
    },
  ];
  (store as Record<string, unknown[]>).conversation_records = [
    {
      id: "cr-1",
      inquiry_id: OLD,
      record_kind: "order",
      record_id: ORDER,
      fulfilment_state: "confirmed",
      unlinked_at: null,
    },
  ];
  store.orders.push({
    id: ORDER,
    tenant_id: TENANT,
    inquiry_id: OLD,
    status: "paid",
    currency: "USD",
    version: 3,
    source_channel: "messages",
  });
  store.order_lines.push(
    {
      id: "ln-yes",
      tenant_id: TENANT,
      order_id: ORDER,
      offering_id: "off-1",
      units: 2,
      confirmed_at: "2026-09-01T00:00:00.000Z",
      variant_id: null,
      addon_ids: [],
      session_id: null,
      booking_id: null,
    },
    {
      id: "ln-no",
      tenant_id: TENANT,
      order_id: ORDER,
      offering_id: "off-1",
      units: 1,
      confirmed_at: null,
      variant_id: null,
      addon_ids: [],
      session_id: null,
      booking_id: null,
    },
  );
  return store;
}

test("copies confirmed lines onto a new messages draft; skips unconfirmed; old order id unchanged", async () => {
  const store = seed();
  const oldLineCount = store.order_lines.length;
  const result = await bookAgainFromRecord(fakeAdmin(store), {
    tenantId: TENANT,
    inquiryId: OLD,
    recordId: ORDER,
    createInquiry: async (_admin, intent, ctx) => {
      assert.equal(intent.source, "book_again");
      assert.equal(intent.source_context.rebook_of_inquiry_id, OLD);
      assert.equal(intent.source_context.original_booking_id, ORDER);
      assert.equal(ctx.guest_session_id, "guest-1");
      (store as Record<string, unknown[]>).inquiries.push({ id: NEW, tenant_id: TENANT, guest_session_id: "guest-1" });
      return { ok: true, inquiryId: NEW };
    },
  });
  assert.deepEqual(result, { ok: true, inquiryId: NEW });
  assert.equal(store.orders[0].id, ORDER);
  assert.equal(store.orders[0].inquiry_id, OLD);
  assert.equal(store.order_lines.filter((l) => l.order_id === ORDER).length, 2);
  assert.equal(oldLineCount, 2);
  const created = store.orders.find((o) => o.id !== ORDER);
  assert.ok(created);
  assert.equal(created.source_channel, "messages");
  assert.equal(created.inquiry_id, NEW);
  const copied = store.order_lines.filter((l) => l.order_id === created.id);
  assert.equal(copied.length, 1);
  assert.equal(copied[0].units, 2);
  assert.equal(copied[0].proposed_by, "client");
  assert.equal((store as Record<string, unknown[]>).agency_bookings?.length ?? 0, 0);
});

test("a confirmed record whose lines carry no stamp (counter sale) copies every priced line", async () => {
  const store = seed();
  store.order_lines[0].confirmed_at = null;
  const result = await bookAgainFromRecord(fakeAdmin(store), {
    tenantId: TENANT,
    inquiryId: OLD,
    recordId: ORDER,
    createInquiry: async () => {
      (store as Record<string, unknown[]>).inquiries.push({ id: NEW, tenant_id: TENANT, guest_session_id: "guest-1" });
      return { ok: true, inquiryId: NEW };
    },
  });
  assert.deepEqual(result, { ok: true, inquiryId: NEW });
  const created = store.orders.find((o) => o.id !== ORDER);
  assert.ok(created);
  assert.equal(store.order_lines.filter((l) => l.order_id === created.id).length, 2);
});

test("a record with no priced lines is not_allowed and creates nothing", async () => {
  const store = seed();
  for (const l of store.order_lines) l.offering_id = null;
  const result = await bookAgainFromRecord(fakeAdmin(store), {
    tenantId: TENANT,
    inquiryId: OLD,
    recordId: ORDER,
    createInquiry: async () => {
      throw new Error("must not create");
    },
  });
  assert.deepEqual(result, { ok: false, reason: "not_allowed" });
  assert.equal(store.orders.length, 1);
  assert.equal(store.orders[0].id, ORDER);
});

test("unassigned thread: the workspace owner opens the draft; without one it is no_owner", async () => {
  const store = seed();
  (store as Record<string, unknown[]>).inquiries[0] = { ...(store as Record<string, Record<string, unknown>[]>).inquiries[0], owner_user_id: null };
  const create = async () => {
    (store as Record<string, unknown[]>).inquiries.push({ id: NEW, tenant_id: TENANT, guest_session_id: "guest-1" });
    return { ok: true as const, inquiryId: NEW };
  };
  const refused = await bookAgainFromRecord(fakeAdmin(store), { tenantId: TENANT, inquiryId: OLD, recordId: ORDER, createInquiry: create, resolveOwner: async () => null });
  assert.deepEqual(refused, { ok: false, reason: "no_owner" });
  assert.equal(store.orders.length, 1);
  const ok = await bookAgainFromRecord(fakeAdmin(store), { tenantId: TENANT, inquiryId: OLD, recordId: ORDER, createInquiry: create, resolveOwner: async () => OWNER });
  assert.deepEqual(ok, { ok: true, inquiryId: NEW });
  assert.equal(store.orders.length, 2);
});

test("writer file does not import the staff shell, calendar, or admissions", () => {
  const src = readFileSync(join(SRC, "lib/messaging/client-book-again.ts"), "utf8");
  assert.doesNotMatch(src, /messages-v5\/screens|messages-v5\/shell|components\/admin/);
  assert.doesNotMatch(src, /agency_bookings|admissions|talent_bookings|lib\/calendar/);
  assert.doesNotMatch(src, /inquiry-intent-engine|messaging-engine/);
});
