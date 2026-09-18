/**
 * program-tab-model.test.ts — the Programa tab's form bridge and list
 * judgements (Wave 2, PR C).
 *
 * Run: node_modules/.bin/tsx --test src/lib/events/schedule/program-tab-model.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScheduleItem } from "./model";
import {
  draftFromItem,
  draftToInput,
  emptyDraft,
  isoToVenueLocal,
  labelLocale,
  movedOrder,
  moveTargets,
  overlapNotes,
  toSaveWire,
  venueLocalToIso,
} from "./program-tab-model";

const ZONE = "America/Cancun";
const EVENT = "11111111-1111-1111-1111-111111111111";
const SPACE = "22222222-2222-2222-2222-222222222222";
const SESSION = "33333333-3333-3333-3333-333333333333";
const TALENT = "44444444-4444-4444-4444-444444444444";

function item(over: Partial<ScheduleItem> & { id: string }): ScheduleItem {
  return {
    tenantId: "t",
    eventId: EVENT,
    sessionId: null,
    spaceId: null,
    kind: "set",
    title: over.id,
    subtitle: null,
    description: null,
    startsAt: null,
    endsAt: null,
    timeTba: false,
    performerTalentProfileId: null,
    performerName: null,
    performerTba: false,
    coverMediaId: null,
    media: {},
    links: {},
    sponsor: {},
    tags: [],
    visibility: "public",
    status: "draft",
    sortOrder: 0,
    i18n: undefined,
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}

test("labelLocale: any es-* is es, everything else is en", () => {
  assert.equal(labelLocale("es-MX"), "es");
  assert.equal(labelLocale("ES"), "es");
  assert.equal(labelLocale("fr"), "en");
  assert.equal(labelLocale(null), "en");
});

test("venue wall clock ⇄ instant round-trips in the venue zone, not the runner's", () => {
  // Cancún is UTC-5 all year.
  assert.equal(venueLocalToIso("2026-11-21T18:00", ZONE), "2026-11-21T23:00:00.000Z");
  assert.equal(isoToVenueLocal("2026-11-21T23:00:00.000Z", ZONE), "2026-11-21T18:00");
  // Across midnight: 01:30 Sunday local is 06:30Z.
  assert.equal(venueLocalToIso("2026-11-22T01:30", ZONE), "2026-11-22T06:30:00.000Z");
});

test("venueLocalToIso refuses without a zone, and on garbage", () => {
  assert.equal(venueLocalToIso("2026-11-21T18:00", null), null);
  assert.equal(venueLocalToIso("", ZONE), null);
  assert.equal(venueLocalToIso("tonight", ZONE), null);
  assert.equal(venueLocalToIso("2026-11-21T25:00", ZONE), null);
  assert.equal(isoToVenueLocal("not-a-date", ZONE), "");
  assert.equal(isoToVenueLocal("2026-11-21T23:00:00.000Z", null), "");
});

test("emptyDraft picks the only night; leaves it open with several", () => {
  assert.equal(emptyDraft([SESSION]).sessionId, SESSION);
  assert.equal(emptyDraft([SESSION, "x"]).sessionId, "");
  assert.equal(emptyDraft([]).sessionId, "");
});

test("draftToInput: a title is required; a start is required unless TBA", () => {
  const d = emptyDraft([]);
  assert.deepEqual(draftToInput(d, ZONE), { ok: false, issue: { field: "title", code: "title" } });
  const withTitle = { ...d, title: "Doors" };
  assert.deepEqual(draftToInput(withTitle, ZONE), { ok: false, issue: { field: "startsLocal", code: "start" } });
  const tba = draftToInput({ ...withTitle, timeTba: true }, ZONE);
  assert.ok(tba.ok);
  assert.equal(tba.input.starts_at, null);
  assert.equal(tba.input.time_tba, true);
});

test("draftToInput: no venue zone is a zone refusal, not a start refusal", () => {
  const d = { ...emptyDraft([]), title: "Set", startsLocal: "2026-11-21T18:00" };
  assert.deepEqual(draftToInput(d, null), { ok: false, issue: { field: "startsLocal", code: "zone" } });
});

test("draftToInput: an end before the start is refused on the end field", () => {
  const d = { ...emptyDraft([]), title: "Set", startsLocal: "2026-11-21T18:00", endsLocal: "2026-11-21T17:00" };
  assert.deepEqual(draftToInput(d, ZONE), { ok: false, issue: { field: "endsLocal", code: "end" } });
});

test("draftToInput: a non-http link is refused on the link field; sponsor url likewise", () => {
  const base = { ...emptyDraft([]), title: "Set", timeTba: true };
  assert.deepEqual(draftToInput({ ...base, link: "ftp://x" }, ZONE), { ok: false, issue: { field: "link", code: "link" } });
  assert.deepEqual(draftToInput({ ...base, sponsorName: "Acme", sponsorUrl: "acme" }, ZONE), { ok: false, issue: { field: "sponsorUrl", code: "sponsorUrl" } });
});

test("draftToInput → toSaveWire: the full shape, in the venue zone, camelCased for the action", () => {
  const d = {
    ...emptyDraft([SESSION]),
    title: "  Headliner  ",
    kind: "performance" as const,
    startsLocal: "2026-11-21T23:30",
    endsLocal: "2026-11-22T01:00",
    performerId: TALENT,
    performerName: "DJ Luna",
    spaceId: SPACE,
    coverMediaId: "55555555-5555-5555-5555-555555555555",
    coverUrl: "https://cdn/x.jpg",
    description: "Closing set",
    link: "https://example.com/luna",
    staffOnly: true,
    status: "published" as const,
    sponsorName: "Acme",
    sponsorUrl: "https://acme.com",
  };
  const r = draftToInput(d, ZONE, 3);
  assert.ok(r.ok);
  assert.equal(r.input.title, "Headliner");
  assert.equal(r.input.starts_at, "2026-11-22T04:30:00.000Z");
  assert.equal(r.input.ends_at, "2026-11-22T06:00:00.000Z");
  assert.equal(r.input.visibility, "staff");
  const wire = toSaveWire(r.input, EVENT, "66666666-6666-6666-6666-666666666666");
  assert.equal(wire.id, "66666666-6666-6666-6666-666666666666");
  assert.equal(wire.eventId, EVENT);
  assert.equal(wire.sessionId, SESSION);
  assert.equal(wire.spaceId, SPACE);
  assert.equal(wire.startsAt, "2026-11-22T04:30:00.000Z");
  assert.equal(wire.performerTalentProfileId, TALENT);
  assert.equal(wire.performerName, "DJ Luna");
  assert.deepEqual(wire.links, { href: "https://example.com/luna" });
  assert.deepEqual(wire.sponsor, { name: "Acme", url: "https://acme.com" });
  assert.equal(wire.status, "published");
  assert.equal(wire.visibility, "staff");
  assert.ok(!("coverUrl" in wire) && !("performerHeroUrl" in wire), "display-only fields never reach the wire");
  // Create: no id key at all, so the action's `id: uuid.optional()` sees nothing.
  assert.ok(!("id" in toSaveWire(r.input, EVENT, null)));
});

test("draftFromItem: an item round-trips through the form", () => {
  const it = item({
    id: "a",
    title: "Doors",
    kind: "doors",
    sessionId: SESSION,
    spaceId: SPACE,
    startsAt: "2026-11-21T23:00:00.000Z",
    endsAt: "2026-11-22T00:00:00.000Z",
    links: { href: "https://x.y" },
    sponsor: { name: "Acme" },
    visibility: "staff",
    status: "published",
  });
  const d = draftFromItem(it, ZONE);
  assert.equal(d.startsLocal, "2026-11-21T18:00");
  assert.equal(d.endsLocal, "2026-11-21T19:00");
  assert.equal(d.staffOnly, true);
  assert.equal(d.status, "published");
  assert.equal(d.link, "https://x.y");
  assert.equal(d.sponsorName, "Acme");
  const back = draftToInput(d, ZONE);
  assert.ok(back.ok);
  assert.equal(back.input.starts_at, it.startsAt);
  assert.equal(back.input.ends_at, it.endsAt);
});

test("overlapNotes: both sides of a crossing get the other's title and the space name", () => {
  const a = item({ id: "a", title: "A", spaceId: SPACE, startsAt: "2026-11-21T23:00:00.000Z", endsAt: "2026-11-22T01:00:00.000Z" });
  const b = item({ id: "b", title: "B", spaceId: SPACE, startsAt: "2026-11-22T00:00:00.000Z" });
  const c = item({ id: "c", title: "C", spaceId: SPACE, startsAt: "2026-11-22T02:00:00.000Z" });
  const notes = overlapNotes([a, b, c], [{ id: SPACE, name: "Main Stage" }]);
  assert.deepEqual(notes.get("a"), [{ withTitle: "B", spaceName: "Main Stage" }]);
  assert.deepEqual(notes.get("b"), [{ withTitle: "A", spaceName: "Main Stage" }]);
  assert.equal(notes.get("c"), undefined);
});

test("moveTargets: only a neighbour at the same instant (or both TBA) is a target", () => {
  const t1a = item({ id: "t1a", startsAt: "2026-11-21T23:00:00.000Z", sortOrder: 0 });
  const t1b = item({ id: "t1b", startsAt: "2026-11-21T23:00:00.000Z", sortOrder: 1 });
  const t2 = item({ id: "t2", startsAt: "2026-11-22T00:00:00.000Z" });
  const tbaA = item({ id: "tbaA", timeTba: true, sortOrder: 0 });
  const tbaB = item({ id: "tbaB", timeTba: true, sortOrder: 1 });
  const group = [t1a, t1b, t2, tbaA, tbaB];
  assert.deepEqual(moveTargets(group, "t1a"), { up: null, down: "t1b" });
  assert.deepEqual(moveTargets(group, "t1b"), { up: "t1a", down: null });
  assert.deepEqual(moveTargets(group, "t2"), { up: null, down: null });
  assert.deepEqual(moveTargets(group, "tbaA"), { up: null, down: "tbaB" });
  assert.deepEqual(moveTargets(group, "missing"), { up: null, down: null });
});

test("movedOrder: the whole event's ids, sorted, with the two swapped", () => {
  const t1a = item({ id: "t1a", startsAt: "2026-11-21T23:00:00.000Z", sortOrder: 0 });
  const t1b = item({ id: "t1b", startsAt: "2026-11-21T23:00:00.000Z", sortOrder: 1 });
  const t2 = item({ id: "t2", startsAt: "2026-11-22T00:00:00.000Z" });
  const tba = item({ id: "tba", timeTba: true });
  assert.deepEqual(movedOrder([tba, t2, t1b, t1a], "t1a", "t1b"), ["t1b", "t1a", "t2", "tba"]);
  assert.deepEqual(movedOrder([t1a, t1b], "t1a", "nope"), ["t1a", "t1b"]);
});
