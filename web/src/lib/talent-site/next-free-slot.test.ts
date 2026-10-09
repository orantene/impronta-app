import assert from "node:assert/strict";
import { test } from "node:test";

import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import {
  carriesAtSlot,
  chipCandidates,
  chipSlot,
  pickChipOffering,
  findFirstFreeSlot,
  firstSlotStart,
  openAtNextSlot,
  pickSlotOffering,
  registerSlotOffering,
  runSlotTap,
} from "./next-free-slot";
import { lookupBookableOffering, openBookingAtSlot } from "./open-booking-at-slot";

const ID = "0b9f0c3e-5d2a-4f6e-8a1b-3c4d5e6f7a8b";
const NOW = new Date("2026-10-08T12:00:00.000Z");
const SLOT = "2026-10-09T15:00:00.000Z";

const offering = (over: Partial<TalentOffering> = {}): TalentOffering =>
  ({
    id: ID,
    kind: "service",
    bookingMode: "instant",
    priceType: "fixed",
    priceDisplay: "show",
    amountCents: 5000,
    durationMinutes: 60,
    visibility: "public",
    variants: [],
    addOns: [],
    ...over,
  }) as unknown as TalentOffering;

const detailOf = (o: TalentOffering): OfferingRequestDetail =>
  ({ offeringId: o.id, title: "Cut", intent: "instant" }) as unknown as OfferingRequestDetail;

test("firstSlotStart takes the first future instant and ignores junk", () => {
  assert.equal(firstSlotStart([SLOT, "2026-10-10T10:00:00.000Z"], NOW), SLOT);
  assert.equal(firstSlotStart(["2026-10-01T10:00:00.000Z", "nope", SLOT], NOW), SLOT);
  assert.equal(firstSlotStart([], NOW), null);
  assert.equal(firstSlotStart(["nope"], NOW), null);
});

test("options and inquiry-only offerings are not opened at a slot", () => {
  assert.equal(carriesAtSlot(offering()), true);
  assert.equal(carriesAtSlot(offering({ variants: [{}] as never })), false);
  assert.equal(carriesAtSlot(offering({ addOns: [{}] as never })), false);
  assert.equal(carriesAtSlot(offering({ bookingMode: "inquiry" })), false);
  assert.equal(carriesAtSlot(offering({ durationMinutes: null })), false);
  assert.equal(carriesAtSlot(offering({ kind: "product" })), false);
});

test("pickSlotOffering takes the first offering that books", () => {
  const inquiry = offering({ id: "a", bookingMode: "inquiry" });
  const withOptions = offering({ id: "b", variants: [{}] as never });
  const good = offering({ id: "c" });
  assert.equal(pickSlotOffering([inquiry, withOptions, good], {})?.id, "c");
  assert.equal(pickSlotOffering([inquiry, withOptions], {}), null);
  assert.equal(pickSlotOffering([], {}), null);
});

test("registration is idempotent and skips offerings the slot rail cannot carry", () => {
  const o = offering({ id: "reg-1" });
  assert.equal(registerSlotOffering(o, detailOf(o)), true);
  const first = lookupBookableOffering("reg-1");
  assert.equal(registerSlotOffering(o, detailOf(o)), true);
  assert.equal(lookupBookableOffering("reg-1")?.offeringId, first?.offeringId);
  const opts = offering({ id: "reg-2", variants: [{}] as never });
  assert.equal(registerSlotOffering(opts, detailOf(opts)), false);
  assert.equal(lookupBookableOffering("reg-2"), null);
});

test("openAtNextSlot sends the offering and the slot, and does nothing without a slot", () => {
  const calls: unknown[] = [];
  const open = ((input: unknown) => (calls.push(input), true)) as typeof openBookingAtSlot;
  assert.equal(openAtNextSlot({ offeringId: ID, slotStart: SLOT }, open), true);
  assert.deepEqual(calls, [{ offeringId: ID, slotStart: SLOT }]);
  assert.equal(openAtNextSlot(null, open), false);
  assert.equal(calls.length, 1);
});

test("runSlotTap opens at the slot, else falls back to the old target", () => {
  let fallbacks = 0;
  const fallback = () => void (fallbacks += 1);
  const ok = (() => true) as typeof openBookingAtSlot;
  const refuse = (() => false) as typeof openBookingAtSlot;
  const slot = { offeringId: ID, slotStart: SLOT };

  assert.equal(runSlotTap(slot, false, fallback, ok), "opened-at-slot");
  assert.equal(fallbacks, 0);
  // No slot known yet, API error (null), menu already on screen, or the offering unregistered.
  assert.equal(runSlotTap(null, false, fallback, ok), "fallback");
  assert.equal(runSlotTap(slot, true, fallback, ok), "fallback");
  assert.equal(runSlotTap(slot, false, fallback, refuse), "fallback");
  assert.equal(fallbacks, 3);
});

test("runSlotTap through the real emitter dispatches with slotStart once registered", () => {
  const o = offering({ id: "reg-3" });
  registerSlotOffering(o, detailOf(o));
  const events: CustomEvent[] = [];
  const target = { dispatchEvent: (e: Event) => (events.push(e as CustomEvent), true) };
  const open = ((input: Parameters<typeof openBookingAtSlot>[0]) =>
    openBookingAtSlot({ ...input, now: NOW }, target)) as typeof openBookingAtSlot; // pinned clock: sanitizeSlotStart drops past slots
  assert.equal(runSlotTap({ offeringId: "reg-3", slotStart: SLOT }, false, () => {}, open), "opened-at-slot");
  assert.equal(events.length, 1);
  assert.equal((events[0].detail as OfferingRequestDetail).slotStart, SLOT);
  assert.equal(events[0].type, "tulala:offering-instant");
});

test("TUL-275: a same-day slot is shown AND opened at that slot, not left to the anchor fallback", () => {
  const today = "2026-10-08T18:00:00.000Z"; // same UTC day as NOW, later than NOW
  const o = offering({ id: "reg-today" });
  registerSlotOffering(o, detailOf(o));
  const { when, slot } = chipSlot("reg-today", [today, SLOT], true, NOW);
  assert.equal(when, today);
  assert.deepEqual(slot, { offeringId: "reg-today", slotStart: today });

  const events: CustomEvent[] = [];
  const target = { dispatchEvent: (e: Event) => (events.push(e as CustomEvent), true) };
  const open = ((i: Parameters<typeof openBookingAtSlot>[0]) => openBookingAtSlot({ ...i, now: NOW }, target)) as typeof openBookingAtSlot; // pinned clock
  assert.equal(openAtNextSlot(slot, open), true); // true => the chip calls preventDefault, no #services scroll
  assert.equal((events[0].detail as OfferingRequestDetail).slotStart, today);
});

test("TUL-275: the chip never shows a past slot it cannot open", () => {
  const past = "2026-10-08T09:00:00.000Z";
  const { when, slot } = chipSlot(ID, [past, "2026-10-08T18:00:00.000Z"], true, NOW);
  assert.equal(when, "2026-10-08T18:00:00.000Z");
  assert.equal(slot?.slotStart, when);
  assert.deepEqual(chipSlot(ID, [past], true, NOW), { when: null, slot: null });
});

test("TUL-275: the chip asks about an offering the sheet can open at a slot", () => {
  const withOptions = offering({ id: "opt", variants: [{}] as never });
  const plain = offering({ id: "plain" });
  assert.equal(pickChipOffering([withOptions, plain])?.offering.id, "plain");
  assert.equal(pickChipOffering([withOptions, plain])?.openable, true);
  assert.deepEqual(
    [pickChipOffering([withOptions])?.offering.id, pickChipOffering([withOptions])?.openable],
    ["opt", false],
  );
  assert.equal(chipSlot("opt", [SLOT], false, NOW).slot, null);
  assert.equal(pickChipOffering([plain], "missing"), null);
});

test("TUL-346: chipCandidates orders slot-openable offerings first, pinned stays alone", () => {
  const plain = offering({ id: "plain" });
  const withOptions = offering({ id: "opts", variants: [{}] as never });
  const list = [withOptions, plain];
  assert.deepEqual(chipCandidates(list).map((c) => [c.offering.id, c.openable]), [
    ["plain", true],
    ["opts", false],
  ]);
  assert.deepEqual(chipCandidates(list, "opts").map((c) => c.offering.id), ["opts"]);
  assert.deepEqual(chipCandidates(list, "missing"), []);
});

test("TUL-346: findFirstFreeSlot skips an offering with no slots and keeps shown = opened", async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const calls: string[] = [];
  const cands = chipCandidates([offering({ id: "tenantless" }), offering({ id: "bookable" })]);
  const found = await findFirstFreeSlot(cands, async (id) => {
    calls.push(id);
    return id === "bookable"
      ? { slots: [future], timezone: "America/Cancun" }
      : { slots: [], timezone: "UTC" };
  });
  assert.deepEqual(calls, ["tenantless", "bookable"]);
  assert.equal(found?.offeringId, "bookable");
  assert.equal(found?.timezone, "America/Cancun");
  const shown = chipSlot(found!.offeringId, found!.slots, found!.openable);
  assert.equal(shown.when, future);
  assert.deepEqual(shown.slot, { offeringId: "bookable", slotStart: future });
});

test("TUL-346: findFirstFreeSlot tolerates a throwing fetch and caps probes at 4", async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const calls: string[] = [];
  const cands = chipCandidates(["a", "b", "c", "d", "e"].map((id) => offering({ id })));
  const none = await findFirstFreeSlot(cands, async (id) => {
    calls.push(id);
    if (id === "a") throw new Error("boom");
    return id === "e" ? { slots: [future], timezone: "UTC" } : { slots: [], timezone: "UTC" };
  });
  assert.equal(none, null);
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
  assert.equal(await findFirstFreeSlot([], async () => ({ slots: [future], timezone: "UTC" })), null);
});
