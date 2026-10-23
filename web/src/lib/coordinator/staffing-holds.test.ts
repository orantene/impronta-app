import assert from "node:assert/strict";
import test from "node:test";

import { holdTag, planJobHolds, STAFFING_HOLD_MAX_PICKS } from "./staffing-holds";
import { canHold, pickerRows } from "./staffing-picker-view";

const NOW = new Date("2026-10-22T12:00:00Z");
const win = { startsAt: "2026-11-07T20:00:00Z", endsAt: "2026-11-08T02:00:00Z" };
const base = { window: win, picked: ["a", "b"], assignedIds: [] as string[], heldIds: [] as string[], now: NOW };

test("plan: holds the picked people over the job window and lapses within a week", () => {
  const p = planJobHolds(base);
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.deepEqual(p.place, ["a", "b"]);
  assert.equal(p.startsAt, "2026-11-07T20:00:00.000Z");
  assert.equal(p.expiresAt, "2026-10-29T12:00:00.000Z");
});

test("plan: a hold never outlives the job start", () => {
  const p = planJobHolds({ ...base, window: { startsAt: "2026-10-24T10:00:00Z", endsAt: "2026-10-24T18:00:00Z" } });
  assert.ok(p.ok);
  if (p.ok) assert.equal(p.expiresAt, "2026-10-24T10:00:00.000Z");
});

test("plan: no window, a past job, nobody picked and too many picks are refused", () => {
  assert.deepEqual(planJobHolds({ ...base, window: { startsAt: null, endsAt: null } }), { ok: false, reason: "no_window" });
  assert.deepEqual(planJobHolds({ ...base, window: { startsAt: "2026-11-08T02:00:00Z", endsAt: "2026-11-07T20:00:00Z" } }), { ok: false, reason: "no_window" });
  assert.deepEqual(planJobHolds({ ...base, window: { startsAt: "2026-10-01T10:00:00Z", endsAt: "2026-10-01T12:00:00Z" } }), { ok: false, reason: "window_past" });
  assert.deepEqual(planJobHolds({ ...base, picked: [] }), { ok: false, reason: "none_picked" });
  assert.deepEqual(planJobHolds({ ...base, picked: Array.from({ length: STAFFING_HOLD_MAX_PICKS + 1 }, (_, i) => `t${i}`) }), { ok: false, reason: "too_many" });
});

test("plan: people already on the job, already held or picked twice are skipped, not held again", () => {
  const p = planJobHolds({ ...base, picked: ["a", "a", "b", "c"], assignedIds: ["b"], heldIds: ["c"] });
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.deepEqual(p.place, ["a"]);
  assert.deepEqual(p.skipped.map((s) => `${s.talentProfileId}:${s.reason}`).sort(), ["a:duplicate", "b:already_assigned", "c:already_held"]);
});

test("holdTag: en and es, and a lapsed hold is not called held", () => {
  assert.equal(holdTag("2026-11-01T00:00:00Z", "es", NOW), "Reservado");
  assert.equal(holdTag("2026-11-01T00:00:00Z", "en", NOW), "Held");
  assert.equal(holdTag("2026-10-01T00:00:00Z", "en", NOW), "Hold lapsed");
});

const roster = [
  { talentProfileId: "free-low", name: "Bea", availability: "free" as const, rating: 3.9 },
  { talentProfileId: "free-high", name: "Ana", availability: "free" as const, rating: 4.8 },
  { talentProfileId: "unk", name: "Cruz", availability: "unknown" as const, rating: 5 },
  { talentProfileId: "busy", name: "Dev", availability: "busy" as const, rating: 5 },
];
const f = { showUnavailable: false, minRating: null, sortBy: "best" as const };

test("picker: free people only by default, best rated first; unknown is never free", () => {
  const rows = pickerRows(roster, { assignedIds: [], heldIds: [] }, f);
  assert.deepEqual(rows.map((r) => r.talentProfileId), ["free-high", "free-low"]);
  const all = pickerRows(roster, { assignedIds: [], heldIds: [] }, { ...f, showUnavailable: true });
  assert.deepEqual(all.map((r) => r.availability), ["free", "free", "unknown", "busy"]);
});

test("picker: min rating filters; assigned, held, busy and unchecked rows cannot be picked", () => {
  const rows = pickerRows(roster, { assignedIds: ["free-high"], heldIds: ["free-low"] }, { ...f, minRating: 4 });
  assert.deepEqual(rows.map((r) => r.talentProfileId), ["free-high"]);
  assert.equal(canHold(rows[0]), false);
  const held = pickerRows(roster, { assignedIds: [], heldIds: ["free-low"] }, f).find((r) => r.talentProfileId === "free-low");
  assert.ok(held && held.held && !canHold(held));
  assert.equal(canHold(pickerRows(roster, { assignedIds: [], heldIds: [] }, f)[0]), true);
  const all = pickerRows(roster, { assignedIds: [], heldIds: [] }, { ...f, showUnavailable: true });
  for (const id of ["unk", "busy"]) assert.equal(canHold(all.find((r) => r.talentProfileId === id)!), false, id);
});
