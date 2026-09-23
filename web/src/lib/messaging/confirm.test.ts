import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { confirmRecord, type ConfirmDeps, type ConfirmInput } from "./confirm";
import type { ConfirmReaders } from "./confirm-plan";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const ACTOR = uuid(3);
const OFFER = uuid(4);
const ORDER = uuid(5);
const BOOKING = uuid(6);
const ANA = uuid(7);
const OFFERING = uuid(8);
const POOL = uuid(9);
const LINE = uuid(10);
const OTHER_TENANT = uuid(99);

const T0 = "2026-09-20T15:00:00.000Z";
const T1 = "2026-09-20T16:00:00.000Z";

const STAMP = {
  reservation: { v: 1, offering_id: OFFERING, starts_at: T0, ends_at: T1, timezone: "America/Mexico_City", duration_minutes: 60, mode: "request" },
};

type Store = Parameters<typeof fakeAdmin>[0];

function seed(overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {}): Store {
  return {
    inquiries: [{ id: INQUIRY, tenant_id: TENANT, version: 3, status: "approved", source_context: STAMP }],
    conversation_identity: [{ inquiry_id: INQUIRY, tenant_id: TENANT, level: "linked", method: "phone" }],
    conversation_records: [],
    inquiry_action_log: [],
    inquiry_messages: [],
    inquiry_offers: [{ id: OFFER, inquiry_id: INQUIRY, tenant_id: TENANT, status: "accepted", deposit_pct: null, deposit_amount_cents: null }],
    inquiry_offer_line_items: [{ id: uuid(40), offer_id: OFFER, label: "Haircut with Ana", talent_profile_id: ANA, units: 1, sort_order: 0 }],
    talent_offerings: [{ id: OFFERING, tenant_id: TENANT, title: "Haircut", talent_profile_id: ANA, capacity_pool_id: null, reserve_mode: "full", deposit_pct: null }],
    payment_links: [],
    booking_transactions: [],
    orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: INQUIRY, status: "draft", total_cents: 25000, currency: "USD", version: 1 }],
    order_lines: [{ id: LINE, order_id: ORDER, label: "Haircut", offering_id: OFFERING, session_id: null, variant_id: null, units: 1 }],
    capacity_allocations: [],
    sessions: [],
    capacity_pools: [],
    talent_offering_variants: [],
    ...overrides,
  };
}

type Calls = { convert: number; hold: number; commit: number; zero: number; cards: Array<{ kind: string; payload?: Record<string, unknown> }> };

function deps(
  overrides: Omit<Partial<ConfirmDeps>, "readers"> & { readers?: Partial<ConfirmReaders> } = {},
): { deps: ConfirmDeps; calls: Calls } {
  const calls: Calls = { convert: 0, hold: 0, commit: 0, zero: 0, cards: [] };
  const readers: ConfirmReaders = { busy: async () => [], remaining: async () => 10, ...(overrides.readers ?? {}) };
  const d: ConfirmDeps = {
    convertToBooking: (async () => {
      calls.convert += 1;
      return { success: true as const, data: { bookingId: BOOKING, createdWithOverride: false } };
    }) as unknown as ConfirmDeps["convertToBooking"],
    holdDraftOrderCapacity: (async () => {
      calls.hold += 1;
      return { ok: true as const, allocationIds: [uuid(50)], holdIds: [], skipped: false };
    }) as unknown as ConfirmDeps["holdDraftOrderCapacity"],
    commitCapacity: (async (ids: readonly string[]) => {
      calls.commit += 1;
      return { ok: true as const, committed: ids.length };
    }) as unknown as ConfirmDeps["commitCapacity"],
    completeZeroTotalOrder: (async () => {
      calls.zero += 1;
      return { ok: true as const, orderId: ORDER, status: "paid" as const, committed: 1 };
    }) as unknown as ConfirmDeps["completeZeroTotalOrder"],
    insertMessage: (async (_admin: unknown, input: { kind: string; payload?: Record<string, unknown> }) => {
      calls.cards.push({ kind: input.kind, payload: input.payload });
      return { ok: true as const, messageId: uuid(60) };
    }) as unknown as ConfirmDeps["insertMessage"],
    readers: () => readers,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "readers")),
  };
  return { deps: d, calls };
}

function linkRpc(store: Store) {
  return {
    messaging_link_record: (args: Record<string, unknown>) => {
      const inquiry = store.inquiries.find((r) => r.id === args.p_inquiry_id);
      if (!inquiry) return { ok: false, reason: "not_found" };
      if (inquiry.version !== args.p_expected_version) return { ok: false, reason: "conflict", version: inquiry.version };
      const dup = store.conversation_records.some(
        (r) => r.inquiry_id === args.p_inquiry_id && r.record_kind === args.p_record_kind && r.record_id === args.p_record_id && !r.unlinked_at,
      );
      if (dup) return { ok: false, reason: "already_linked" };
      store.conversation_records.push({
        id: uuid(70 + store.conversation_records.length),
        tenant_id: args.p_tenant_id,
        inquiry_id: args.p_inquiry_id,
        record_kind: args.p_record_kind,
        record_id: args.p_record_id,
        unlinked_at: null,
      });
      inquiry.version = Number(inquiry.version) + 1;
      return { ok: true, link_id: uuid(80), version: inquiry.version };
    },
  };
}

function run(store: Store, input: Partial<ConfirmInput>, d = deps()) {
  const { admin } = fakeAdmin(store, linkRpc(store));
  const clients = { admin: admin as never, supabase: admin as never, tenantId: TENANT, actorUserId: ACTOR };
  const full: ConfirmInput = { inquiryId: INQUIRY, source: "offer", offerId: OFFER, expectedVersion: 3, ...input };
  return confirmRecord(clients, full, d.deps).then((result) => ({ result, calls: d.calls, store }));
}

function logRows(store: Store, actionType: string) {
  return store.inquiry_action_log.filter((r) => r.action_type === actionType);
}

// ── preconditions ──────────────────────────────────────────────────────────

test("stale version is a conflict and nothing is touched", async () => {
  const { result, calls, store } = await run(seed(), { expectedVersion: 2 });
  assert.deepEqual(result, { ok: false, reason: "conflict" });
  assert.equal(calls.convert, 0);
  assert.equal(store.conversation_records.length, 0);
});

test("another tenant's inquiry is wrong_tenant", async () => {
  const store = seed({ inquiries: [{ id: INQUIRY, tenant_id: OTHER_TENANT, version: 3, status: "approved", source_context: STAMP }] });
  const { result } = await run(store, {});
  assert.deepEqual(result, { ok: false, reason: "wrong_tenant" });
});

test("identity below linked refuses identity_unconfirmed before any read of the offer", async () => {
  const store = seed({ conversation_identity: [{ inquiry_id: INQUIRY, tenant_id: TENANT, level: "none", method: null }] });
  const { result, calls } = await run(store, {});
  assert.deepEqual(result, { ok: false, reason: "identity_unconfirmed" });
  assert.equal(calls.convert, 0);
});

test("no identity row at all is identity_unconfirmed", async () => {
  const { result } = await run(seed({ conversation_identity: [] }), {});
  assert.deepEqual(result, { ok: false, reason: "identity_unconfirmed" });
});

test("an offer that is not accepted is invalid", async () => {
  const store = seed({ inquiry_offers: [{ id: OFFER, inquiry_id: INQUIRY, tenant_id: TENANT, status: "sent", deposit_pct: null, deposit_amount_cents: null }] });
  const { result, calls } = await run(store, {});
  assert.deepEqual(result, { ok: false, reason: "invalid" });
  assert.equal(calls.convert, 0);
});

test("source offer without an offerId is invalid; source draft without an orderId is invalid", async () => {
  assert.deepEqual((await run(seed(), { offerId: null })).result, { ok: false, reason: "invalid" });
  assert.deepEqual((await run(seed(), { source: "draft", offerId: null, orderId: null })).result, { ok: false, reason: "invalid" });
});

// ── deposit rule ───────────────────────────────────────────────────────────

const DEPOSIT_OFFER = { id: OFFER, inquiry_id: INQUIRY, tenant_id: TENANT, status: "accepted", deposit_pct: 30, deposit_amount_cents: 7500 };

test("offer with a deposit term and no paid deposit refuses deposit_required and creates nothing", async () => {
  const { result, calls, store } = await run(seed({ inquiry_offers: [DEPOSIT_OFFER] }), {});
  assert.deepEqual(result, { ok: false, reason: "deposit_required" });
  assert.equal(calls.convert, 0);
  assert.equal(store.conversation_records.length, 0);
  assert.equal(store.inquiry_action_log.length, 0);
});

test("a short override reason is still deposit_required", async () => {
  const { result } = await run(seed({ inquiry_offers: [DEPOSIT_OFFER] }), { overrideReason: "ok fine" });
  assert.deepEqual(result, { ok: false, reason: "deposit_required" });
});

test("a paid deposit on the conversation satisfies the rule without an override", async () => {
  const store = seed({
    inquiry_offers: [DEPOSIT_OFFER],
    payment_links: [{ id: uuid(90), tenant_id: TENANT, inquiry_id: INQUIRY, order_id: ORDER, status: "paid" }],
  });
  const { result, calls } = await run(store, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.overrode, false);
  assert.equal(calls.convert, 1);
  assert.equal(logRows(store, "messaging_confirm_override").length, 0);
});

test("an override reason of 8+ chars confirms and writes the override to history first", async () => {
  const store = seed({ inquiry_offers: [DEPOSIT_OFFER] });
  const { result, calls } = await run(store, { overrideReason: "Client pays cash at the door, owner agreed" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.overrode, true);
  assert.equal(calls.convert, 1);
  const overrides = logRows(store, "messaging_confirm_override");
  assert.equal(overrides.length, 1);
  assert.equal((overrides[0]?.metadata as { reason: string }).reason, "Client pays cash at the door, owner agreed");
  assert.equal(overrides[0]?.actor_user_id, ACTOR);
});

// ── availability recheck ───────────────────────────────────────────────────

test("a calendar conflict refuses unavailable, names the person and the date, creates nothing", async () => {
  const d = deps({
    readers: { busy: async () => [{ startsAt: new Date("2026-09-20T15:30:00.000Z"), endsAt: new Date("2026-09-20T17:00:00.000Z") }] },
  });
  const { result, calls, store } = await run(seed(), {}, d);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "unavailable");
  // The offer line and the stamp's offering both name Ana on the same window: one calendar question, one conflict.
  assert.deepEqual(result.conflicts?.map((c) => c.why), ["Haircut with Ana is no longer free on 2026-09-20"]);
  assert.equal(calls.convert, 0);
  assert.equal(store.conversation_records.length, 0);
  assert.equal(calls.cards.length, 0);
  const failures = logRows(store, "messaging_confirm");
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.result, "failure");
});

test("a reader that throws fails closed as unavailable with no conflicts and nothing created", async () => {
  const d = deps({ readers: { busy: async () => { throw new Error("calendar down"); } } });
  const { result, calls } = await run(seed(), {}, d);
  assert.deepEqual(result, { ok: false, reason: "unavailable" });
  assert.equal(calls.convert, 0);
});

test("draft: a pool short on units refuses with the line named and the POS writer never runs", async () => {
  const store = seed({
    talent_offerings: [{ id: OFFERING, tenant_id: TENANT, title: "Chair", talent_profile_id: null, capacity_pool_id: POOL, reserve_mode: "full", deposit_pct: null }],
    order_lines: [{ id: LINE, order_id: ORDER, label: "Chair 3", offering_id: OFFERING, session_id: null, variant_id: null, units: 2 }],
  });
  const d = deps({ readers: { remaining: async () => 1 } });
  const { result, calls } = await run(store, { source: "draft", offerId: null, orderId: ORDER }, d);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "unavailable");
  assert.deepEqual(result.conflicts?.map((c) => [c.line, c.code]), [["Chair 3", "capacity_short"]]);
  assert.equal(calls.hold, 0);
  assert.equal(calls.commit, 0);
});

// ── idempotency ────────────────────────────────────────────────────────────

test("offer: a second confirm answers already and creates nothing", async () => {
  const store = seed();
  const first = await run(store, {});
  assert.equal(first.result.ok, true);
  if (!first.result.ok) return;
  const d = deps();
  const second = await run(store, { expectedVersion: first.result.version }, d);
  assert.deepEqual(second.result, { ok: false, reason: "already" });
  assert.equal(d.calls.convert, 0);
  assert.equal(store.conversation_records.length, 1);
  assert.equal(logRows(store, "messaging_confirm").length, 1);
});

test("offer: an inquiry already booked answers already even with no link row", async () => {
  const store = seed({ inquiries: [{ id: INQUIRY, tenant_id: TENANT, version: 3, status: "booked", source_context: STAMP }] });
  const { result, calls } = await run(store, {});
  assert.deepEqual(result, { ok: false, reason: "already" });
  assert.equal(calls.convert, 0);
});

test("draft: a second confirm of the same order answers already and holds nothing again", async () => {
  const store = seed();
  const first = await run(store, { source: "draft", offerId: null, orderId: ORDER });
  assert.equal(first.result.ok, true);
  if (!first.result.ok) return;
  const d = deps();
  const second = await run(store, { source: "draft", offerId: null, orderId: ORDER, expectedVersion: first.result.version }, d);
  assert.deepEqual(second.result, { ok: false, reason: "already" });
  assert.equal(d.calls.hold, 0);
  assert.equal(d.calls.commit, 0);
});

// ── happy paths ────────────────────────────────────────────────────────────

test("offer happy path: rechecks, converts through convertToBooking, links project, logs, posts appointment card", async () => {
  const store = seed();
  const { result, calls } = await run(store, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, "project");
  assert.equal(result.recordId, BOOKING);
  assert.equal(result.version, 4);
  assert.equal(result.plan.checks.length, 1, "one talent on one window is one check");
  assert.equal(calls.convert, 1);
  assert.equal(calls.hold, 0);

  const link = store.conversation_records[0];
  assert.equal(link?.record_kind, "project");
  assert.equal(link?.record_id, BOOKING);

  const log = logRows(store, "messaging_confirm");
  assert.equal(log.length, 1);
  assert.equal(log[0]?.result, "success");
  const meta = log[0]?.metadata as Record<string, unknown>;
  assert.equal(meta.availabilityRechecked, true);
  assert.equal(meta.summary, `confirmed project ${BOOKING} from offer · availability rechecked`);

  assert.deepEqual(calls.cards.map((c) => c.kind), ["appointment_confirmation"]);
  assert.equal(calls.cards[0]?.payload?.bookingId, BOOKING);
  assert.equal(calls.cards[0]?.payload?.startsAt, T0);
});

test("offer: convertToBooking version_conflict maps to conflict and nothing is linked", async () => {
  const d = deps({
    convertToBooking: (async () => ({ success: false as const, conflict: true, reason: "version_conflict" })) as unknown as ConfirmDeps["convertToBooking"],
  });
  const { result, store } = await run(seed(), {}, d);
  assert.deepEqual(result, { ok: false, reason: "conflict" });
  assert.equal(store.conversation_records.length, 0);
  assert.equal(d.calls.cards.length, 0);
});

test("offer: a talent_double_booked convert refuses with the line's own 'no longer free' sentence, links nothing (D-MSG-312)", async () => {
  const d = deps({
    convertToBooking: (async () => ({ success: false as const, conflict: true, reason: "talent_double_booked" })) as unknown as ConfirmDeps["convertToBooking"],
  });
  const { result, store } = await run(seed(), {}, d);
  assert.equal(result.ok, false);
  // Not a bare "conflict": the operator is told which line lost the window.
  assert.equal((result as { reason?: string }).reason, "unavailable");
  const conflicts = (result as { conflicts?: { code?: string; why?: string }[] }).conflicts ?? [];
  assert.ok(conflicts.length > 0, "the refusal must name at least one conflicting line");
  assert.equal(conflicts[0]?.code, "person_busy");
  assert.match(String(conflicts[0]?.why ?? ""), /no longer free|already booked/i);
  // Nothing may be linked or announced for a booking that was rolled back.
  assert.equal(store.conversation_records.length, 0);
  assert.equal(d.calls.cards.length, 0);
});

test("draft happy path (money owed): POS hold, commit, link order, log, order card; order stays open for payment", async () => {
  const store = seed();
  const { result, calls } = await run(store, { source: "draft", offerId: null, orderId: ORDER });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, "order");
  assert.equal(result.recordId, ORDER);
  assert.equal(calls.hold, 1);
  assert.equal(calls.commit, 1);
  assert.equal(calls.zero, 0);
  assert.equal(calls.convert, 0);
  assert.equal(store.conversation_records[0]?.record_kind, "order");
  assert.deepEqual(calls.cards.map((c) => c.kind), ["order_confirmation"]);
  assert.equal(calls.cards[0]?.payload?.totalCents, 25000);
  // D-MSG-22 seam: no writer flips draft -> pending_payment outside a payment request.
  assert.equal(store.orders[0]?.status, "draft");
});

test("draft happy path (free): completes through completeZeroTotalOrder instead of a bare commit", async () => {
  const store = seed({ orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: INQUIRY, status: "draft", total_cents: 0, currency: "USD", version: 1 }] });
  const { result, calls } = await run(store, { source: "draft", offerId: null, orderId: ORDER });
  assert.equal(result.ok, true);
  assert.equal(calls.hold, 1);
  assert.equal(calls.zero, 1);
  assert.equal(calls.commit, 0);
});

test("draft: a line already held by the order is not rechecked against its own hold", async () => {
  const store = seed({
    talent_offerings: [{ id: OFFERING, tenant_id: TENANT, title: "Chair", talent_profile_id: null, capacity_pool_id: POOL, reserve_mode: "full", deposit_pct: null }],
    capacity_allocations: [{ id: uuid(55), tenant_id: TENANT, order_line_id: LINE, released_at: null }],
  });
  const d = deps({ readers: { remaining: async () => 0 } });
  const { result } = await run(store, { source: "draft", offerId: null, orderId: ORDER }, d);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.checks.length, 0);
  assert.equal(result.plan.skipped[0]?.why, "already_held");
});

test("draft: a deposit-mode offering with no paid deposit is deposit_required", async () => {
  const store = seed({
    talent_offerings: [{ id: OFFERING, tenant_id: TENANT, title: "Haircut", talent_profile_id: ANA, capacity_pool_id: null, reserve_mode: "deposit", deposit_pct: 50 }],
  });
  const { result, calls } = await run(store, { source: "draft", offerId: null, orderId: ORDER });
  assert.deepEqual(result, { ok: false, reason: "deposit_required" });
  assert.equal(calls.hold, 0);
});

test("draft: the POS writer refusing sold_out is unavailable with a named conflict and no commit", async () => {
  const d = deps({
    holdDraftOrderCapacity: (async () => ({ ok: false as const, reason: "sold_out" as const, error: "That is no longer free." })) as unknown as ConfirmDeps["holdDraftOrderCapacity"],
  });
  const { result, store } = await run(seed(), { source: "draft", offerId: null, orderId: ORDER }, d);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "unavailable");
  assert.equal(result.conflicts?.[0]?.code, "capacity_short");
  assert.equal(d.calls.commit, 0);
  assert.equal(store.conversation_records.length, 0);
});

test("draft: an order from another conversation is wrong_tenant", async () => {
  const store = seed({ orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: uuid(77), status: "draft", total_cents: 100, currency: "USD", version: 1 }] });
  const { result } = await run(store, { source: "draft", offerId: null, orderId: ORDER });
  assert.deepEqual(result, { ok: false, reason: "wrong_tenant" });
});
