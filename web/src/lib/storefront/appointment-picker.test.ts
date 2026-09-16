import assert from "node:assert/strict";
import { test } from "node:test";

import type { InstantPurchaseResult } from "@/lib/scheduling/instant-purchase";

import {
  actAppointmentPickerCore,
  readAppointmentPickerCore,
  type AppointmentPickerDeps,
  type BookableOffering,
} from "./appointment-picker.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";
import { memoryIdempotentRunner } from "./__fixtures__/memory-runner";

const TENANT = uuid(1);
const PERSON = uuid(2);
const CUT = uuid(3);
const HOUSE = uuid(4);
// A Tuesday, 09:00 UTC. Hours below are UTC 09:00-12:00 every day.
const NOW = new Date("2026-09-15T08:00:00.000Z");

function offering(over: Partial<BookableOffering>): BookableOffering {
  return {
    id: CUT,
    talentProfileId: PERSON,
    ownerKind: "talent",
    tenantId: TENANT,
    kind: "service",
    title: "Fade",
    description: "30 minutes",
    priceType: "fixed",
    priceDisplay: "exact",
    amountCents: 3000,
    currency: "USD",
    bookingMode: "instant",
    reserveMode: "deposit",
    depositPct: 50,
    allowPayInPerson: true,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: 24,
    freeReserveExpiresDays: null,
    durationMinutes: 30,
    category: null,
    seatsLabel: null,
    ...over,
  } as BookableOffering;
}

function setup(over: Partial<AppointmentPickerDeps> = {}) {
  const { admin, calls, store } = fakeAdmin({
    talent_profiles: [{ id: PERSON, display_name: "Vic" }],
    talent_booking_hours: [
      {
        talent_profile_id: PERSON,
        timezone: "UTC",
        weekly: { 0: W, 1: W, 2: W, 3: W, 4: W, 5: W, 6: W },
        exceptions: [],
        slot_minutes: 30,
        min_notice_min: 0,
        horizon_days: 30,
      },
    ],
    venues: [{ id: uuid(9), tenant_id: TENANT, name: "Shop", timezone: "UTC", is_default: true, status: "active" }],
  });
  const memory = memoryIdempotentRunner();
  const placed: unknown[] = [];
  const deps: AppointmentPickerDeps = {
    admin,
    runner: memory.runner,
    identity: { guestKey: "g1", userId: null, email: null, displayName: null },
    locale: "en",
    origin: "https://shop.test",
    now: () => NOW,
    loadOfferings: async () => [offering({}), offering({ id: HOUSE, talentProfileId: null, title: "Chair" })],
    loadPortraits: async () => new Map([[PERSON, "https://img/vic.jpg"]]),
    loadBusy: async () => [],
    placePurchase: async (_a, input) => {
      placed.push(input);
      return {
        ok: true,
        orderId: uuid(50),
        customerId: uuid(51),
        totalCents: 3000,
        collectCents: 1500,
        payInPerson: false,
        allocationIds: [],
        transactionId: uuid(52),
        bookingId: uuid(53),
        inquiryId: null,
        reservationHoldId: uuid(54),
      } satisfies InstantPurchaseResult;
    },
    createCheckout: async (input) => ({ ok: true, url: `https://pay.test/${input.transactionId}`, sessionId: "s", mock: true }),
    signManageToken: ({ action }) => `tok-${action}`,
    ...over,
  };
  return { deps, calls, store, placed, memory };
}
const W = [{ startMin: 540, endMin: 720 }];

test("read: services, people, locations are shaped, never raw rows", async () => {
  const { deps } = setup();
  const r = await readAppointmentPickerCore(deps, TENANT, { offeringIds: "all" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.services.length, 2);
  const fade = r.data.services[0]!;
  assert.deepEqual(Object.keys(fade).sort(), [
    "allowPayInPerson", "amountCents", "bookingMode", "currency", "depositPct", "description",
    "durationMinutes", "id", "personId", "seatsLabel", "title",
  ]);
  assert.equal(fade.depositPct, 50);
  assert.deepEqual(r.data.people, [{ id: PERSON, name: "Vic", imageUrl: "https://img/vic.jpg", serviceIds: [CUT] }]);
  assert.equal(r.data.locations[0]?.name, "Shop");
  assert.equal(r.data.timezone, "UTC");
  assert.equal(r.data.availability, null);
  assert.equal(r.data.prefill, null);
});

test("read: offeringIds filters; an unknown tenant id is refused before any query", async () => {
  const { deps, calls } = setup();
  const only = await readAppointmentPickerCore(deps, TENANT, { offeringIds: [HOUSE] });
  assert.ok(only.ok && only.data.services.length === 1 && only.data.services[0]!.id === HOUSE);
  const bad = await readAppointmentPickerCore(deps, "not-a-uuid", {});
  assert.deepEqual(bad, { ok: false, reason: "invalid_request" });
  assert.ok(calls.every((c) => c.op !== "insert"));
});

test("read: availability for a service groups slots by day in the person's zone, minus busy time", async () => {
  const { deps } = setup({
    loadBusy: async () => [{ startsAt: new Date("2026-09-15T09:00:00Z"), endsAt: new Date("2026-09-15T10:00:00Z") }],
  });
  const r = await readAppointmentPickerCore(deps, TENANT, { offeringId: CUT, day: "2026-09-15", days: 2 });
  assert.ok(r.ok);
  if (!r.ok) return;
  const a = r.data.availability!;
  assert.equal(a.timezone, "UTC");
  assert.equal(a.emptyReason, null);
  const today = a.days.find((d) => d.date === "2026-09-15")!;
  // 09:00-12:00 with 30 min slots = 6, minus the busy hour = 4
  assert.equal(today.slots.length, 4);
  assert.equal(today.slots[0]!.startsAtIso, "2026-09-15T10:00:00.000Z");
  assert.equal(today.slots[0]!.endsAtIso, "2026-09-15T10:30:00.000Z");
});

test("read: a house service and a person with no hours answer a named empty reason", async () => {
  const { deps } = setup();
  const house = await readAppointmentPickerCore(deps, TENANT, { offeringId: HOUSE });
  assert.ok(house.ok && house.data.availability?.emptyReason === "not_bookable_here");
  const { deps: noHours } = setup();
  noHours.admin = fakeAdmin({ talent_profiles: [{ id: PERSON, display_name: "Vic" }], venues: [] }).admin;
  const r = await readAppointmentPickerCore(noHours, TENANT, { offeringId: CUT });
  assert.ok(r.ok && r.data.availability?.emptyReason === "no_booking_hours");
});

const INPUT = {
  tenantId: TENANT,
  offeringId: CUT,
  personId: PERSON,
  startsAtIso: "2026-09-15T10:00:00.000Z",
  contact: { name: "Ana", email: "ana@example.com" },
  payment: "deposit" as const,
  clientOrderKey: "cart-0001-aaaa",
};

test("act: refuses without identity and touches no engine", async () => {
  const { deps, placed } = setup();
  const r = await actAppointmentPickerCore(deps, { ...INPUT, contact: { name: "", email: "" } });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "identity_required");
  assert.equal(placed.length, 0);
});

test("act: a time the day does not offer is refused as past/time_not_offered; a past instant as past", async () => {
  const { deps, placed } = setup();
  const off = await actAppointmentPickerCore(deps, { ...INPUT, startsAtIso: "2026-09-15T10:15:00.000Z" });
  assert.ok(!off.ok && off.reason === "past" && off.code === "time_not_offered");
  const past = await actAppointmentPickerCore(deps, { ...INPUT, startsAtIso: "2026-09-15T07:00:00.000Z" });
  assert.ok(!past.ok && past.reason === "past");
  assert.equal(placed.length, 0);
});

test("act: books through the purchase pipeline with the re-derived slot, returns checkout + manage links", async () => {
  const { deps, placed } = setup();
  const r = await actAppointmentPickerCore(deps, INPUT);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(placed.length, 1);
  const sent = placed[0] as { reservation: { startsAt: string; endsAt: string }; payInPerson: boolean; contact: { email: string } };
  assert.deepEqual(sent.reservation, { startsAt: "2026-09-15T10:00:00.000Z", endsAt: "2026-09-15T10:30:00.000Z" });
  assert.equal(sent.payInPerson, false);
  assert.equal(sent.contact.email, "ana@example.com");
  assert.equal(r.collectCents, 1500);
  assert.equal(r.checkoutUrl, `https://pay.test/${uuid(52)}`);
  assert.equal(r.manage.cancelUrl, "https://shop.test/manage/tok-cancel");
  assert.equal(r.manage.rescheduleUrl, "https://shop.test/manage/tok-reschedule");
  assert.equal(r.confirmation.personName, "Vic");
  assert.equal(r.confirmation.serviceTitle, "Fade");
  assert.equal(r.replayed, false);
});

test("act: the same key replays the same booking without a second purchase", async () => {
  const { deps, placed } = setup();
  const first = await actAppointmentPickerCore(deps, INPUT);
  const second = await actAppointmentPickerCore(deps, INPUT);
  assert.ok(first.ok && second.ok);
  assert.equal(placed.length, 1);
  assert.equal(second.orderId, first.orderId);
  assert.equal(second.replayed, true);
  // Same key, different intent: a conflict, not a second booking.
  const other = await actAppointmentPickerCore(deps, { ...INPUT, startsAtIso: "2026-09-15T11:00:00.000Z" });
  assert.ok(!other.ok && other.reason === "conflict");
  assert.equal(placed.length, 1);
});

test("act: pipeline refusals are mapped — slot_taken → full, no_contact → identity_required, and a refused key is retryable", async () => {
  let reason: "slot_taken" | "no_contact" | null = "slot_taken";
  const { deps, placed } = setup({
    placePurchase: async () => {
      placed.push(reason);
      if (reason) return { ok: false, reason, error: "x" } as InstantPurchaseResult;
      return {
        ok: true, orderId: uuid(60), customerId: null, totalCents: 0, collectCents: 0, payInPerson: true,
        allocationIds: [], transactionId: null, bookingId: null, inquiryId: null, reservationHoldId: null,
      };
    },
  });
  const taken = await actAppointmentPickerCore(deps, INPUT);
  assert.ok(!taken.ok && taken.reason === "full" && taken.code === "slot_taken");
  reason = "no_contact";
  const anon = await actAppointmentPickerCore(deps, INPUT);
  assert.ok(!anon.ok && anon.reason === "identity_required");
  reason = null;
  const ok = await actAppointmentPickerCore(deps, { ...INPUT, payment: "in_person" });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.checkoutUrl, null);
  assert.deepEqual(ok.manage, { cancelUrl: null, rescheduleUrl: null });
  assert.equal(placed.length, 3);
});

test("act: a service that is inquiry-only is refused, not booked", async () => {
  const { deps, placed } = setup({ loadOfferings: async () => [offering({ bookingMode: "request" })] });
  const r = await actAppointmentPickerCore(deps, INPUT);
  assert.ok(!r.ok && r.reason === "refused" && r.code === "inquiry_only");
  assert.equal(placed.length, 0);
});
