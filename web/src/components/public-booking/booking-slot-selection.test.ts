import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveSheetOpening,
  resolveSlotSelection,
  slotArrivalPlan,
  slotGoneMessage,
} from "./booking-slot-selection";

const TZ = "UTC";
const days = [
  { key: "2026-10-09", starts: ["2026-10-09T10:00:00.000Z", "2026-10-09T15:00:00.000Z"] },
  { key: "2026-10-10", starts: ["2026-10-10T09:00:00.000Z"] },
];

test("slot present selects its day and time", () => {
  assert.deepEqual(resolveSlotSelection({ slotStart: "2026-10-10T09:00:00.000Z", liveDays: days, timezone: TZ }), {
    kind: "selected",
    dayIndex: 1,
    start: "2026-10-10T09:00:00.000Z",
  });
  // Same instant, different spelling.
  assert.equal(resolveSlotSelection({ slotStart: "2026-10-09T15:00:00Z", liveDays: days, timezone: TZ }).kind, "selected");
});

test("slot missing falls back to its own day with a notice", () => {
  assert.deepEqual(resolveSlotSelection({ slotStart: "2026-10-09T12:00:00.000Z", liveDays: days, timezone: TZ }), {
    kind: "day",
    dayIndex: 0,
    notice: true,
  });
});

test("its day empty falls back to the first day with slots, with a notice", () => {
  assert.deepEqual(resolveSlotSelection({ slotStart: "2026-10-12T09:00:00.000Z", liveDays: days, timezone: TZ }), {
    kind: "first",
    dayIndex: 0,
    notice: true,
  });
  const withEmptyFirst = [{ key: "2026-10-08", starts: [] }, ...days];
  assert.equal(
    (resolveSlotSelection({ slotStart: "2026-10-12T09:00:00.000Z", liveDays: withEmptyFirst, timezone: TZ }) as { dayIndex: number }).dayIndex,
    1,
  );
});

test("no days at all is none", () => {
  assert.deepEqual(resolveSlotSelection({ slotStart: "2026-10-09T15:00:00.000Z", liveDays: [], timezone: TZ }), { kind: "none" });
  assert.equal(slotArrivalPlan("2026-10-09T15:00:00.000Z", [], TZ, "en"), null);
});

test("a longer total duration drops the slot from the projected starts: day fallback", () => {
  const longer = [{ key: "2026-10-09", starts: ["2026-10-09T10:00:00.000Z"] }, days[1]!];
  assert.equal(resolveSlotSelection({ slotStart: "2026-10-09T15:00:00.000Z", liveDays: longer, timezone: TZ }).kind, "day");
});

test("arrival plan: selected sets clock and ISO, fallback clears them and shows the notice", () => {
  const ok = slotArrivalPlan("2026-10-09T15:00:00.000Z", days, TZ, "en")!;
  assert.equal(ok.liveStarts, "2026-10-09T15:00:00.000Z");
  assert.ok(ok.time);
  assert.equal(ok.notice, null);
  const gone = slotArrivalPlan("2026-10-09T12:00:00.000Z", days, TZ, "es")!;
  assert.equal(gone.liveStarts, null);
  assert.equal(gone.time, null);
  assert.equal(gone.notice?.message, slotGoneMessage("es"));
  assert.equal(gone.notice?.lostStarts, "2026-10-09T12:00:00.000Z");
  assert.equal(slotArrivalPlan(null, days, TZ, "en"), null);
});

test("copy exists in es and en without em dashes", () => {
  for (const l of ["es", "en"]) assert.ok(!slotGoneMessage(l).includes("—"));
  assert.notEqual(slotGoneMessage("es"), slotGoneMessage("en"));
});

const draft = { step: "who" as const, time: "09:00", liveStarts: "2026-10-09T10:00:00.000Z" };

test("explicit slot beats the draft's time and step; options come first", () => {
  const withSlot = resolveSheetOpening({ mode: "live", slotStart: "2026-10-09T15:00:00.000Z", needsOptions: false, draft });
  assert.deepEqual(withSlot, { slot: "2026-10-09T15:00:00.000Z", time: null, liveStarts: null, step: "when" });
  assert.equal(
    resolveSheetOpening({ mode: "live", slotStart: "2026-10-09T15:00:00.000Z", needsOptions: true, draft: null }).step,
    "choose",
  );
});

test("demo mode ignores slotStart", () => {
  const o = resolveSheetOpening({ mode: "demo", slotStart: "2026-10-09T15:00:00.000Z", needsOptions: false, draft: null });
  assert.equal(o.slot, null);
  assert.equal(o.step, "choose");
});

test("without a slot the opening is byte-identical to the previous behaviour", () => {
  // draft resumes; a live draft that left from "who" resumes on "when"
  assert.deepEqual(resolveSheetOpening({ mode: "live", needsOptions: true, draft }), {
    slot: null,
    time: "09:00",
    liveStarts: "2026-10-09T10:00:00.000Z",
    step: "when",
  });
  assert.equal(resolveSheetOpening({ mode: "demo", needsOptions: false, draft }).step, "who");
  // no draft: startAt "when" only when no options
  assert.equal(resolveSheetOpening({ mode: "live", startAt: "when", needsOptions: false, draft: null }).step, "when");
  assert.equal(resolveSheetOpening({ mode: "live", startAt: "when", needsOptions: true, draft: null }).step, "choose");
  assert.equal(resolveSheetOpening({ mode: "live", needsOptions: false, draft: null }).step, "choose");
});
