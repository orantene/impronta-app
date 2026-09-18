import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeDb, type Row } from "./schedule-postgrest-fake.test-helper";
import {
  DUPLICATE_SUFFIX,
  deleteScheduleItemRow,
  duplicateScheduleItemRow,
  importLineupAsScheduleItemRows,
  listEventSpaceRows,
  listScheduleItemRows,
  reorderScheduleItemRows,
  saveEventProgramSettingsRow,
  saveScheduleItemRow,
  scheduleItemWireToInput,
  searchPerformerRows,
} from "./schedule/staff-store";
import { SCHEDULE_ITEM_LIMITS, scheduleItemInputSchema } from "./schedule/model";

/**
 * The schedule store against the scripted PostgREST fake: every foreign key
 * is checked inside the tenant, every write is tenant-scoped, the duplicate
 * carries its suffix, the reorder writes `sort_order`, and the lineup import
 * is idempotent by performer. The staff actions are one guard + one parse
 * around these; `schedule-actions.guard.static.test.ts` pins that shape.
 */

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const EVENT = "22222222-2222-4222-8222-222222222222";
const EVENT_B = "22222222-2222-4222-8222-222222222223";
const VENUE = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const SESSION_B = "44444444-4444-4444-8444-444444444445";
const STAGE = "55555555-5555-4555-8555-555555555555";
const STAGE_OTHER_VENUE = "55555555-5555-4555-8555-555555555556";
const TALENT = "66666666-6666-4666-8666-666666666666";
const TALENT_PUBLIC = "66666666-6666-4666-8666-666666666667";
const TALENT_HIDDEN = "66666666-6666-4666-8666-666666666668";
const ITEM = "77777777-7777-4777-8777-777777777777";
const ITEM_2 = "77777777-7777-4777-8777-777777777778";

function item(over: Row = {}): Row {
  return {
    id: ITEM, tenant_id: T, event_id: EVENT, session_id: null, space_id: null, kind: "set", title: "DJ Sofia",
    subtitle: null, description: null, starts_at: "2026-11-21T23:00:00Z", ends_at: null, time_tba: false,
    performer_talent_profile_id: null, performer_name: null, performer_tba: false, cover_media_id: null,
    media: {}, links: {}, sponsor: {}, tags: [], visibility: "public", status: "published", sort_order: 0, i18n: {},
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...over,
  };
}

function world(over: Partial<Record<string, Row[]>> = {}) {
  return {
    events: [
      { id: EVENT, tenant_id: T, venue_id: VENUE, status: "published", program: { enabled: true, heading: "El programa", set_times_public: true, group_by: "day" } },
      { id: EVENT_B, tenant_id: T, venue_id: null, status: "published", program: {} },
    ],
    sessions: [
      { id: SESSION, tenant_id: T, event_id: EVENT, starts_at: "2026-11-21T22:00:00Z", status: "scheduled" },
      { id: SESSION_B, tenant_id: T, event_id: EVENT_B, starts_at: "2026-11-28T22:00:00Z", status: "scheduled" },
    ],
    spaces: [
      { id: STAGE, tenant_id: T, venue_id: VENUE, kind: "stage", name: "Main Stage", code: null, status: "active", sort_order: 5 },
      { id: STAGE_OTHER_VENUE, tenant_id: T, venue_id: "33333333-3333-4333-8333-333333333334", kind: "stage", name: "Elsewhere", code: null, status: "active", sort_order: 0 },
    ],
    agency_talent_roster: [{ id: "r1", tenant_id: T, talent_profile_id: TALENT, status: "active" }],
    talent_profiles: [
      { id: TALENT, display_name: "Sofia", first_name: "Sofía", last_name: null, workflow_status: "draft", visibility: "hidden", deleted_at: null },
      { id: TALENT_PUBLIC, display_name: "Mateo", first_name: null, last_name: null, workflow_status: "published", visibility: "public", deleted_at: null },
      { id: TALENT_HIDDEN, display_name: "Ghost", first_name: null, last_name: null, workflow_status: "published", visibility: "hidden", deleted_at: null },
    ],
    event_schedule_items: [item()],
    inquiries: [],
    inquiry_participants: [],
    media_assets: [],
    ...over,
  };
}

const client = (db: ReturnType<typeof fakeDb>) => db.admin as unknown as SupabaseClient;

const baseInput = { eventId: EVENT, kind: "talk", title: "Opening", startsAt: "2026-11-21T22:30:00Z" };

test("list: an event of another tenant is refused; the tenant's own event lists its rows and settings", async () => {
  const db = fakeDb(world());
  const foreign = await listScheduleItemRows(client(db), OTHER, EVENT);
  assert.equal(foreign.ok, false);
  const own = await listScheduleItemRows(client(db), T, EVENT);
  assert.ok(own.ok);
  assert.equal(own.items.length, 1);
  assert.equal(own.settings.heading, "El programa");
  const listRead = db.calls.find((c) => c.table === "event_schedule_items");
  assert.ok(listRead?.filters.some(([c, , v]) => c === "tenant_id" && v === T), "the list read is tenant-scoped");
});

test("save: creates a row scoped to the tenant with the next sort_order, and refuses an item with neither a start nor TBA", async () => {
  const db = fakeDb(world());
  const created = await saveScheduleItemRow(client(db), T, baseInput);
  assert.ok(created.ok, JSON.stringify(created));
  const row = db.rows.event_schedule_items!.find((r) => r.id === created.id)!;
  assert.equal(row.tenant_id, T);
  assert.equal(row.sort_order, 1);
  assert.equal(row.status, "draft");
  const noTime = await saveScheduleItemRow(client(db), T, { eventId: EVENT, kind: "talk", title: "x" });
  assert.equal(noTime.ok, false);
  const tba = await saveScheduleItemRow(client(db), T, { eventId: EVENT, kind: "talk", title: "x", timeTba: true });
  assert.ok(tba.ok);
});

test("save: the camelCase wire is renamed column for column and judged by the model's one rule", async () => {
  const wire = {
    ...baseInput, id: ITEM, sessionId: SESSION, spaceId: null, subtitle: "Late", timeTba: false, performerName: "MC", performerTba: true, coverMediaId: null,
    media: { galleryMediaIds: [TALENT], videoUrl: "https://v.example/1" }, links: { href: "https://x.example", label: "Tickets" }, sponsor: { name: "Brand", logoMediaId: TALENT_PUBLIC },
    tags: ["house"], visibility: "staff", status: "published", i18n: { es: { title: "Apertura" } }, unknownKey: "dropped",
  };
  const input = scheduleItemWireToInput(wire);
  assert.deepEqual(input, {
    session_id: SESSION, space_id: null, kind: "talk", title: "Opening", subtitle: "Late", starts_at: baseInput.startsAt, time_tba: false, performer_name: "MC", performer_tba: true, cover_media_id: null,
    media: { gallery_media_ids: [TALENT], video_url: "https://v.example/1" }, links: { href: "https://x.example", label: "Tickets" }, sponsor: { name: "Brand", logo_media_id: TALENT_PUBLIC },
    tags: ["house"], visibility: "staff", status: "published", i18n: { es: { title: "Apertura" } },
  }, "no ids, no unknown keys, absent keys stay absent so the model's defaults apply");
  assert.ok(scheduleItemInputSchema.safeParse(input).success, "the renamed wire is a valid model input");

  const db = fakeDb(world());
  // The limits are the model's, not a second copy: one over the title cap and one over the gallery cap are refused; at the cap they pass.
  assert.equal((await saveScheduleItemRow(client(db), T, { ...baseInput, title: "x".repeat(SCHEDULE_ITEM_LIMITS.title + 1) })).ok, false);
  assert.ok((await saveScheduleItemRow(client(db), T, { ...baseInput, title: "x".repeat(SCHEDULE_ITEM_LIMITS.title) })).ok);
  const seven = Array.from({ length: SCHEDULE_ITEM_LIMITS.galleryMax + 1 }, () => TALENT);
  assert.equal((await saveScheduleItemRow(client(db), T, { ...baseInput, media: { galleryMediaIds: seven } })).ok, false);
  assert.equal((await saveScheduleItemRow(client(db), T, { ...baseInput, media: { videoUrl: "javascript:alert(1)" } })).ok, false);
  assert.equal((await saveScheduleItemRow(client(db), T, { ...baseInput, eventId: "not-a-uuid" })).ok, false);
  assert.equal((await saveScheduleItemRow(client(db), T, { ...baseInput, endsAt: "2026-11-21T22:00:00Z" })).ok, false, "end before start");
  // A TBA save with a stray start stores no time, and the JSON blobs land under their column names.
  const saved = await saveScheduleItemRow(client(db), T, { ...baseInput, timeTba: true, media: { videoUrl: "https://v.example/1" }, sponsor: { name: "Brand", logoMediaId: TALENT_PUBLIC } });
  assert.ok(saved.ok, JSON.stringify(saved));
  const row = db.rows.event_schedule_items!.find((r) => r.id === saved.id)!;
  assert.equal(row.starts_at, null);
  assert.equal(row.time_tba, true);
  assert.deepEqual(row.media, { video_url: "https://v.example/1" });
  assert.deepEqual(row.sponsor, { name: "Brand", logo_media_id: TALENT_PUBLIC });
  assert.deepEqual(row.links, {});
});

test("save: session must belong to the event, space to the event's venue, performer to the roster or public talent", async () => {
  const db = fakeDb(world());
  const wrongNight = await saveScheduleItemRow(client(db), T, { ...baseInput, sessionId: SESSION_B });
  assert.equal(wrongNight.ok, false);
  assert.match((wrongNight as { error: string }).error, /night/);
  const rightNight = await saveScheduleItemRow(client(db), T, { ...baseInput, sessionId: SESSION });
  assert.ok(rightNight.ok);

  const wrongSpace = await saveScheduleItemRow(client(db), T, { ...baseInput, spaceId: STAGE_OTHER_VENUE });
  assert.equal(wrongSpace.ok, false);
  assert.match((wrongSpace as { error: string }).error, /venue/);
  const noVenue = await saveScheduleItemRow(client(db), T, { ...baseInput, eventId: EVENT_B, spaceId: STAGE });
  assert.equal(noVenue.ok, false);
  const rightSpace = await saveScheduleItemRow(client(db), T, { ...baseInput, spaceId: STAGE });
  assert.ok(rightSpace.ok);

  const rosterAct = await saveScheduleItemRow(client(db), T, { ...baseInput, performerTalentProfileId: TALENT });
  assert.ok(rosterAct.ok, "a roster member links even when the profile is not public");
  const publicAct = await saveScheduleItemRow(client(db), T, { ...baseInput, performerTalentProfileId: TALENT_PUBLIC });
  assert.ok(publicAct.ok);
  const hiddenAct = await saveScheduleItemRow(client(db), T, { ...baseInput, performerTalentProfileId: TALENT_HIDDEN });
  assert.equal(hiddenAct.ok, false);
  assert.match((hiddenAct as { error: string }).error, /roster/);
  // The roster check is scoped to THIS tenant: the same talent seen from another tenant is not on its roster.
  const otherTenant = await saveScheduleItemRow(client(db), OTHER, { ...baseInput, performerTalentProfileId: TALENT });
  assert.equal(otherTenant.ok, false);
});

test("save: an update is scoped by tenant + event + id and refuses a miss instead of inserting", async () => {
  const db = fakeDb(world());
  const before = db.rows.event_schedule_items!.length;
  const miss = await saveScheduleItemRow(client(db), OTHER, { ...baseInput, id: ITEM });
  assert.equal(miss.ok, false);
  assert.equal(db.rows.event_schedule_items!.length, before, "nothing inserted on a missed update");
  const hit = await saveScheduleItemRow(client(db), T, { ...baseInput, id: ITEM, title: "DJ Sofia (late)", status: "published" });
  assert.ok(hit.ok);
  const upd = db.calls.find((c) => c.table === "event_schedule_items" && c.op === "update")!;
  assert.ok(upd.filters.some(([c, , v]) => c === "tenant_id" && v === T));
  assert.ok(upd.filters.some(([c, , v]) => c === "event_id" && v === EVENT));
  assert.equal(db.rows.event_schedule_items![0]!.title, "DJ Sofia (late)");
});

test("delete: tenant-scoped, and a foreign id is a refusal", async () => {
  const db = fakeDb(world());
  assert.equal((await deleteScheduleItemRow(client(db), OTHER, ITEM)).ok, false);
  assert.equal(db.rows.event_schedule_items!.length, 1);
  assert.ok((await deleteScheduleItemRow(client(db), T, ITEM)).ok);
  assert.equal(db.rows.event_schedule_items!.length, 0);
});

test("duplicate: copies the row as a draft with the suffix, right after the original", async () => {
  const db = fakeDb(world({ event_schedule_items: [item({ status: "published", performer_talent_profile_id: TALENT, tags: ["house"] })] }));
  const res = await duplicateScheduleItemRow(client(db), T, ITEM);
  assert.ok(res.ok);
  const copy = db.rows.event_schedule_items!.find((r) => r.id === res.id)!;
  assert.equal(copy.title, `DJ Sofia${DUPLICATE_SUFFIX}`);
  assert.equal(copy.status, "draft");
  assert.equal(copy.sort_order, 1);
  assert.equal(copy.performer_talent_profile_id, TALENT);
  assert.deepEqual(copy.tags, ["house"]);
  assert.notEqual(copy.id, ITEM);
  assert.equal((await duplicateScheduleItemRow(client(db), OTHER, ITEM)).ok, false);
});

test("reorder: writes sort_order = index, and refuses the whole batch when one id is not the event's", async () => {
  const db = fakeDb(world({ event_schedule_items: [item(), item({ id: ITEM_2, title: "Second", sort_order: 1 })] }));
  const res = await reorderScheduleItemRows(client(db), T, EVENT, [ITEM_2, ITEM]);
  assert.deepEqual(res, { ok: true, count: 2 });
  const byId = new Map(db.rows.event_schedule_items!.map((r) => [r.id, r]));
  assert.equal(byId.get(ITEM_2)!.sort_order, 0);
  assert.equal(byId.get(ITEM)!.sort_order, 1);
  for (const w of db.calls.filter((c) => c.op === "update")) {
    assert.ok(w.filters.some(([c, , v]) => c === "tenant_id" && v === T), "every write is tenant-scoped");
  }
  const stranger = await reorderScheduleItemRows(client(db), T, EVENT, [ITEM, "88888888-8888-4888-8888-888888888888"]);
  assert.equal(stranger.ok, false);
  assert.equal(byId.get(ITEM)!.sort_order, 1, "nothing written on a refused batch");
});

test("settings: partial update keeps the other keys and writes events.program tenant-scoped", async () => {
  const db = fakeDb(world());
  const res = await saveEventProgramSettingsRow(client(db), T, EVENT, { enabled: false, setTimesPublic: false });
  assert.ok(res.ok);
  assert.deepEqual(res.settings, { enabled: false, heading: "El programa", set_times_public: false, group_by: "day" });
  const upd = db.calls.find((c) => c.table === "events" && c.op === "update")!;
  assert.ok(upd.filters.some(([c, , v]) => c === "tenant_id" && v === T));
  assert.equal((await saveEventProgramSettingsRow(client(db), OTHER, EVENT, { enabled: true })).ok, false);
  assert.equal((await saveEventProgramSettingsRow(client(db), T, EVENT, { enabled: "yes" })).ok, false);
});

test("import from lineup: one draft set per BOOKED act, time TBA, talent linked; a second run adds nothing", async () => {
  const db = fakeDb(world({
    event_schedule_items: [],
    inquiries: [
      { id: "i1", tenant_id: T, event_id: EVENT, status: "booked" },
      { id: "i2", tenant_id: T, event_id: EVENT, status: "offer_pending" },
      { id: "i3", tenant_id: T, event_id: EVENT_B, status: "booked" },
    ],
    inquiry_participants: [
      { inquiry_id: "i1", talent_profile_id: TALENT, status: "active" },
      { inquiry_id: "i1", talent_profile_id: TALENT_PUBLIC, status: "declined" },
      { inquiry_id: "i2", talent_profile_id: TALENT_HIDDEN, status: "active" },
      { inquiry_id: "i3", talent_profile_id: TALENT_PUBLIC, status: "active" },
    ],
  }));
  const first = await importLineupAsScheduleItemRows(client(db), T, EVENT);
  assert.deepEqual(first, { ok: true, created: 1, skipped: 0 });
  const rows = db.rows.event_schedule_items!;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.performer_talent_profile_id, TALENT);
  assert.equal(rows[0]!.kind, "set");
  assert.equal(rows[0]!.time_tba, true);
  assert.equal(rows[0]!.status, "draft");
  assert.equal(rows[0]!.title, "Sofia");
  assert.equal(rows[0]!.tenant_id, T);

  const second = await importLineupAsScheduleItemRows(client(db), T, EVENT);
  assert.deepEqual(second, { ok: true, created: 0, skipped: 1 });
  assert.equal(db.rows.event_schedule_items!.length, 1);

  const inqRead = db.calls.find((c) => c.table === "inquiries")!;
  assert.ok(inqRead.filters.some(([c, , v]) => c === "tenant_id" && v === T), "the spine read is tenant-scoped");
  assert.equal((await importLineupAsScheduleItemRows(client(db), OTHER, EVENT)).ok, false);
});

test("performers: roster first, then public talent, never a hidden non-roster profile; hero from media_assets", async () => {
  const db = fakeDb(world({
    talent_profiles: [
      { id: TALENT, display_name: "Sofia Beat", first_name: null, last_name: null, workflow_status: "draft", visibility: "hidden", deleted_at: null },
      { id: TALENT_PUBLIC, display_name: "Sofia Public", first_name: null, last_name: null, workflow_status: "published", visibility: "public", deleted_at: null },
      { id: TALENT_HIDDEN, display_name: "Sofia Hidden", first_name: null, last_name: null, workflow_status: "published", visibility: "hidden", deleted_at: null },
    ],
    media_assets: [{ id: "m1", owner_talent_profile_id: TALENT_PUBLIC, storage_path: "https://cdn.example/mateo.jpg", variant_kind: "hero", deleted_at: null }],
  }));
  const res = await searchPerformerRows(client(db), T, "sofia");
  assert.ok(res.ok);
  assert.deepEqual(res.performers.map((p) => [p.id, p.source]), [[TALENT, "roster"], [TALENT_PUBLIC, "public"]]);
  assert.equal(res.performers[1]!.heroUrl, "https://cdn.example/mateo.jpg");
  assert.equal(res.performers[0]!.heroUrl, null);
  const empty = await searchPerformerRows(client(db), T, "");
  assert.ok(empty.ok);
  assert.deepEqual(empty.performers.map((p) => p.source), ["roster"], "an empty query lists the roster alone");
});

test("spaces: the event's venue only, stage / room / area first; an event without a venue has none", async () => {
  const db = fakeDb(world({
    spaces: [
      { id: "t7", tenant_id: T, venue_id: VENUE, kind: "table", name: "T7", code: "T7", status: "active", sort_order: 0 },
      { id: STAGE, tenant_id: T, venue_id: VENUE, kind: "stage", name: "Main Stage", code: null, status: "active", sort_order: 9 },
      { id: "rm", tenant_id: T, venue_id: VENUE, kind: "room", name: "Sala B", code: null, status: "active", sort_order: 1 },
      { id: "gone", tenant_id: T, venue_id: VENUE, kind: "area", name: "Closed", code: null, status: "out_of_service", sort_order: 0 },
      { id: STAGE_OTHER_VENUE, tenant_id: T, venue_id: "other-venue", kind: "stage", name: "Elsewhere", code: null, status: "active", sort_order: 0 },
    ],
  }));
  const res = await listEventSpaceRows(client(db), T, EVENT);
  assert.ok(res.ok);
  assert.deepEqual(res.spaces.map((s) => s.id), [STAGE, "rm", "t7"]);
  const none = await listEventSpaceRows(client(db), T, EVENT_B);
  assert.ok(none.ok);
  assert.deepEqual(none.spaces, []);
  assert.equal((await listEventSpaceRows(client(db), OTHER, EVENT)).ok, false);
});
