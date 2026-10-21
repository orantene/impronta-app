import assert from "node:assert/strict";
import test from "node:test";

import { availabilityByTalent, candidateTag, type BusyRow } from "./replacement-availability";

const win = { startsAt: "2026-11-10T14:00:00Z", endsAt: "2026-11-10T18:00:00Z" };
const busy = (talent: string, s: string, e: string): BusyRow => ({ talentProfileId: talent, startsAt: s, endsAt: e });

test("a person is busy when anything overlaps the job window, free when nothing does", () => {
  const out = availabilityByTalent(["a", "b", "c"], win, [
    busy("a", "2026-11-10T17:00:00Z", "2026-11-10T19:00:00Z"),
    busy("b", "2026-11-10T18:00:00Z", "2026-11-10T20:00:00Z"), // starts exactly when the job ends: no overlap
    busy("c", "2026-11-09T10:00:00Z", "2026-11-09T12:00:00Z"),
  ]);
  assert.deepEqual(out, new Map([["a", "busy"], ["b", "free"], ["c", "free"]]));
});

test("an unreadable busy list means unknown for everyone, never free", () => {
  const out = availabilityByTalent(["a", "b"], win, "unreadable");
  assert.deepEqual(out, new Map([["a", "unknown"], ["b", "unknown"]]));
});

test("no usable job window means unknown, not free", () => {
  assert.deepEqual(availabilityByTalent(["a"], null, []), new Map([["a", "unknown"]]));
  assert.deepEqual(availabilityByTalent(["a"], { startsAt: "nope", endsAt: win.endsAt }, []), new Map([["a", "unknown"]]));
  assert.deepEqual(availabilityByTalent(["a"], { startsAt: win.endsAt, endsAt: win.startsAt }, []), new Map([["a", "unknown"]]));
});

test("malformed busy rows are ignored, other people's rows do not count", () => {
  const out = availabilityByTalent(["a"], win, [busy("a", "nope", "x"), busy("zzz", win.startsAt, win.endsAt)]);
  assert.equal(out.get("a"), "free");
});

test("the label tag says rating and availability in both languages", () => {
  assert.equal(candidateTag({ availability: "free", rating: 4.84 }, "en"), "4.8★");
  assert.equal(candidateTag({ availability: "busy", rating: 4.5 }, "en"), "4.5★ · busy at this time");
  assert.equal(candidateTag({ availability: "unknown", rating: null }, "es"), "disponibilidad sin confirmar");
  assert.equal(candidateTag({ availability: "busy", rating: null }, "es"), "ocupado en ese horario");
  assert.equal(candidateTag({ availability: "free", rating: null }, "en"), "");
});
