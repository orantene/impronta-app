import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeDb, type Row } from "./schedule-postgrest-fake.test-helper";
import { loadPublicEventProgram, nightLabel } from "./schedule/public-loader";

/**
 * `loadPublicEventProgram` against the scripted fake: drafts and staff rows
 * never leave the server, times are stripped when the venue has not made set
 * times public, texts arrive in the visitor's locale, a linked talent supplies
 * name / href / hero, and a missing table or column reads as "no program"
 * instead of a 500.
 */

const T = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const VENUE = "33333333-3333-4333-8333-333333333333";
const NIGHT_1 = "44444444-4444-4444-8444-444444444444";
const NIGHT_CANCELLED = "44444444-4444-4444-8444-444444444445";
const STAGE = "55555555-5555-4555-8555-555555555555";
const TALENT = "66666666-6666-4666-8666-666666666666";
const TALENT_GONE = "66666666-6666-4666-8666-666666666667";

let n = 0;
function item(over: Row = {}): Row {
  n += 1;
  return {
    id: `item-${n}`, tenant_id: T, event_id: EVENT, session_id: NIGHT_1, space_id: null, kind: "set", title: `Act ${n}`,
    subtitle: null, description: null, starts_at: `2026-11-22T0${n}:00:00Z`, ends_at: null, time_tba: false,
    performer_talent_profile_id: null, performer_name: null, performer_tba: false, cover_media_id: null,
    media: {}, links: {}, sponsor: {}, tags: [], visibility: "public", status: "published", sort_order: n, i18n: {},
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...over,
  };
}

function world(program: Row | null = { enabled: true, heading: "Program", heading_i18n: { es: "El programa" }, set_times_public: true, group_by: "day" }, over: Partial<Record<string, Row[]>> = {}) {
  return {
    events: [{ id: EVENT, tenant_id: T, status: "published", venue_id: VENUE, program }],
    sessions: [
      { id: NIGHT_1, tenant_id: T, event_id: EVENT, starts_at: "2026-11-21T22:00:00Z", status: "scheduled" },
      { id: NIGHT_CANCELLED, tenant_id: T, event_id: EVENT, starts_at: "2026-11-28T22:00:00Z", status: "cancelled" },
    ],
    venues: [{ id: VENUE, tenant_id: T, timezone: "America/Cancun" }],
    agencies: [{ id: T, timezone: "Europe/Madrid" }],
    spaces: [{ id: STAGE, tenant_id: T, name: "Main Stage", kind: "stage" }],
    talent_profiles: [
      { id: TALENT, display_name: "DJ Sofia", first_name: "Sofía", profile_code: "TAL-00042", workflow_status: "published", visibility: "public", deleted_at: null },
      { id: TALENT_GONE, display_name: "Gone Act", first_name: null, profile_code: "TAL-00043", workflow_status: "published", visibility: "hidden", deleted_at: null },
    ],
    media_assets: [
      { id: "cover-1", public_url: "https://cdn.example/cover-1.jpg", owner_talent_profile_id: null, storage_path: "x", variant_kind: "gallery", deleted_at: null },
      { id: "hero-sofia", public_url: "https://cdn.example/sofia-hero.jpg", owner_talent_profile_id: TALENT, storage_path: "https://cdn.example/sofia-hero.jpg", variant_kind: "hero", deleted_at: null },
    ],
    event_schedule_items: [],
    ...over,
  };
}

const client = (db: ReturnType<typeof fakeDb>) => db.admin as unknown as SupabaseClient;

test("hides drafts, staff-only rows, items of a cancelled night, and another tenant's rows", async () => {
  const db = fakeDb(world(undefined, {
    event_schedule_items: [
      item({ title: "Public" }),
      item({ title: "Draft", status: "draft" }),
      item({ title: "Soundcheck", visibility: "staff" }),
      item({ title: "Cancelled night", session_id: NIGHT_CANCELLED }),
      item({ title: "Foreign", tenant_id: "99999999-9999-4999-8999-999999999999" }),
    ],
  }));
  const res = await loadPublicEventProgram(client(db), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.ok(res.enabled);
  assert.deepEqual(res.items.map((i) => i.title), ["Public"]);
  assert.deepEqual(res.nights.map((x) => x.sessionId), [NIGHT_1], "only scheduled nights are listed");
  assert.equal(res.zone, "America/Cancun", "the venue zone wins over the workspace zone");
  assert.equal(res.heading, "Program");
  const read = db.calls.find((c) => c.table === "event_schedule_items")!;
  assert.ok(read.filters.some(([c, , v]) => c === "status" && v === "published"));
  assert.ok(read.filters.some(([c, , v]) => c === "visibility" && v === "public"));
  assert.ok(read.filters.some(([c, , v]) => c === "tenant_id" && v === T));
});

test("set_times_public=false strips every time but keeps the item; TBA rows never carry a time", async () => {
  const db = fakeDb(world({ enabled: true, heading: "Lineup", set_times_public: false, group_by: "none" }, {
    event_schedule_items: [item({ ends_at: "2026-11-22T02:00:00Z" }), item({ title: "TBA act", starts_at: null, time_tba: true })],
  }));
  const res = await loadPublicEventProgram(client(db), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.ok(res.enabled);
  assert.equal(res.setTimesPublic, false);
  assert.equal(res.groupBy, "none");
  assert.equal(res.items.length, 2);
  for (const i of res.items) { assert.equal(i.startsAt, null); assert.equal(i.endsAt, null); }
  assert.equal(res.items[1]!.timeTba, true);

  const open = fakeDb(world(undefined, { event_schedule_items: [item({ ends_at: "2026-11-22T02:00:00Z" })] }));
  const shown = await loadPublicEventProgram(client(open), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.ok(shown.enabled);
  assert.equal(shown.items[0]!.endsAt, "2026-11-22T02:00:00Z");
});

test("localizes item texts and the heading for es, falling back to the base text", async () => {
  const db = fakeDb(world(undefined, {
    event_schedule_items: [item({ title: "Opening", subtitle: "Deep house", i18n: { es: { title: "Apertura" } } })],
  }));
  const es = await loadPublicEventProgram(client(db), { tenantId: T, eventId: EVENT, locale: "es" });
  assert.ok(es.enabled);
  assert.equal(es.heading, "El programa");
  assert.equal(es.items[0]!.title, "Apertura");
  assert.equal(es.items[0]!.subtitle, "Deep house");
  const en = await loadPublicEventProgram(client(fakeDb(world(undefined, { event_schedule_items: [item({ title: "Opening", i18n: { es: { title: "Apertura" } } })] }))), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.ok(en.enabled);
  assert.equal(en.items[0]!.title, "Opening");
});

test("resolves the performer: public talent gives name, /t/<code> and the hero as cover fallback; an unpublished profile falls back to the stored name", async () => {
  const db = fakeDb(world(undefined, {
    event_schedule_items: [
      item({ title: "Set", performer_talent_profile_id: TALENT, space_id: STAGE }),
      item({ title: "Own cover", performer_talent_profile_id: TALENT, cover_media_id: "cover-1", links: { instagram: "@sofia" } }),
      item({ title: "Gone", performer_talent_profile_id: TALENT_GONE, performer_name: "The Gone Act" }),
      item({ title: "Guest", performer_name: "Guest MC", sponsor: { name: "Brand", url: "https://brand.example" } }),
      item({ title: "Nobody" }),
    ],
  }));
  const res = await loadPublicEventProgram(client(db), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.ok(res.enabled);
  const [set, own, gone, guest, nobody] = res.items;
  assert.deepEqual(set!.performer, { name: "DJ Sofia", tba: false, profileHref: "/t/TAL-00042", heroUrl: "https://cdn.example/sofia-hero.jpg", instagram: null });
  assert.equal(set!.coverUrl, "https://cdn.example/sofia-hero.jpg", "no cover → the talent's hero");
  assert.equal(own!.coverUrl, "https://cdn.example/cover-1.jpg", "the item's own cover wins");
  assert.equal(own!.performer?.instagram, "@sofia");
  assert.equal(gone!.performer?.name, "The Gone Act");
  assert.equal(gone!.performer?.profileHref, null, "an unpublished profile is not linked");
  assert.equal(guest!.performer?.name, "Guest MC");
  assert.equal(guest!.performer?.profileHref, null);
  assert.deepEqual(guest!.sponsor, { name: "Brand", logoUrl: null, url: "https://brand.example" });
  assert.equal(nobody!.performer, null);
  assert.deepEqual(res.spaces, [{ id: STAGE, name: "Main Stage", kind: "stage" }]);
});

test("enabled:false when the switch is off, the event is not published, the table is absent, or the program column is absent", async () => {
  const off = await loadPublicEventProgram(client(fakeDb(world({ enabled: false, heading: "x" }))), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.deepEqual(off, { enabled: false });
  const draft = await loadPublicEventProgram(client(fakeDb(world(undefined, { events: [{ id: EVENT, tenant_id: T, status: "draft", venue_id: VENUE, program: { enabled: true } }] }))), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.deepEqual(draft, { enabled: false });
  const noTable = await loadPublicEventProgram(client(fakeDb(world(undefined, { event_schedule_items: [item()] }), { missing: ["event_schedule_items"] })), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.deepEqual(noTable, { enabled: false });
  const noColumn = await loadPublicEventProgram(client(fakeDb(world(), { missing: ["events"] })), { tenantId: T, eventId: EVENT, locale: "en" });
  assert.deepEqual(noColumn, { enabled: false });
  const foreign = await loadPublicEventProgram(client(fakeDb(world())), { tenantId: "99999999-9999-4999-8999-999999999999", eventId: EVENT, locale: "en" });
  assert.deepEqual(foreign, { enabled: false });
});

test("night labels render in the venue zone and fall back to a numbered night without one", () => {
  assert.equal(nightLabel("2026-11-22T03:30:00Z", "America/Cancun", "es", 0).toLowerCase(), "sáb, 21 nov");
  assert.equal(nightLabel("2026-11-22T03:30:00Z", "America/Cancun", "en", 0), "Sat, Nov 21");
  assert.equal(nightLabel("2026-11-22T03:30:00Z", null, "es", 1), "Noche 2");
});
