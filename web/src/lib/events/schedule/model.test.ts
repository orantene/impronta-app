import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  DEFAULT_PROGRAM_SETTINGS,
  SCHEDULE_ITEM_KINDS,
  eventProgramSettingsSchema,
  normalizeEventProgramSettings,
  normalizeScheduleItemRow,
  scheduleItemInputSchema,
  scheduleItemKindSchema,
} from "./model";

const MIGRATION = join(process.cwd(), "..", "supabase", "migrations", "20261231249000_event_schedule_items.sql");

const ID = "11111111-1111-1111-1111-111111111111";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EVENT = "22222222-2222-2222-2222-222222222222";

// ── kinds ──────────────────────────────────────────────────────────────────

test("the kind list is the closed list from the proposal, and the migration CHECK matches it", () => {
  assert.deepEqual(
    [...SCHEDULE_ITEM_KINDS],
    [
      "set", "performance", "talk", "panel", "workshop", "class", "ceremony", "presentation",
      "service", "break", "competition", "meet_greet", "afterparty", "doors", "close", "other",
    ],
  );
  const sql = readFileSync(MIGRATION, "utf8");
  const m = sql.match(/kind\s+text[^]*?CHECK \(kind IN \(([^)]*)\)\)/);
  assert.ok(m, "migration declares the kind CHECK");
  const inSql = m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
  assert.deepEqual(inSql.sort(), [...SCHEDULE_ITEM_KINDS].sort());
});

test("scheduleItemKindSchema accepts every kind and refuses anything else", () => {
  for (const k of SCHEDULE_ITEM_KINDS) assert.equal(scheduleItemKindSchema.parse(k), k);
  assert.equal(scheduleItemKindSchema.safeParse("dj").success, false);
  assert.equal(scheduleItemKindSchema.safeParse("").success, false);
});

// ── input ──────────────────────────────────────────────────────────────────

test("a minimal input fills every default", () => {
  const parsed = scheduleItemInputSchema.parse({ title: "  Doors  ", starts_at: "2026-11-21T23:00:00Z" });
  assert.equal(parsed.title, "Doors");
  assert.equal(parsed.kind, "other");
  assert.equal(parsed.time_tba, false);
  assert.equal(parsed.performer_tba, false);
  assert.equal(parsed.visibility, "public");
  assert.equal(parsed.status, "draft");
  assert.equal(parsed.sort_order, 0);
  assert.deepEqual(parsed.media, {});
  assert.deepEqual(parsed.links, {});
  assert.deepEqual(parsed.sponsor, {});
  assert.deepEqual(parsed.tags, []);
  assert.deepEqual(parsed.i18n, {});
});

test("a start is required unless the time is TBA", () => {
  assert.equal(scheduleItemInputSchema.safeParse({ title: "Set" }).success, false);
  assert.equal(scheduleItemInputSchema.safeParse({ title: "Set", time_tba: true }).success, true);
});

test("end must be after start", () => {
  const bad = scheduleItemInputSchema.safeParse({
    title: "Set",
    starts_at: "2026-11-22T03:00:00Z",
    ends_at: "2026-11-22T02:00:00Z",
  });
  assert.equal(bad.success, false);
  const ok = scheduleItemInputSchema.safeParse({
    title: "Set",
    starts_at: "2026-11-22T02:00:00Z",
    ends_at: "2026-11-22T03:00:00Z",
  });
  assert.equal(ok.success, true);
});

test("text limits and empty-string-to-null on optional text", () => {
  const parsed = scheduleItemInputSchema.parse({ title: "Set", time_tba: true, subtitle: "   ", description: "" });
  assert.equal(parsed.subtitle, null);
  assert.equal(parsed.description, null);
  assert.equal(
    scheduleItemInputSchema.safeParse({ title: "Set", time_tba: true, description: "x".repeat(601) }).success,
    false,
  );
});

test("gallery is capped at 6 and video / links are http(s) only", () => {
  const ids = Array.from({ length: 7 }, (_, i) => `${i}1111111-1111-1111-1111-111111111111`);
  assert.equal(
    scheduleItemInputSchema.safeParse({ title: "Set", time_tba: true, media: { gallery_media_ids: ids } }).success,
    false,
  );
  assert.equal(
    scheduleItemInputSchema.safeParse({ title: "Set", time_tba: true, media: { video_url: "javascript:alert(1)" } }).success,
    false,
  );
  assert.equal(
    scheduleItemInputSchema.safeParse({ title: "Set", time_tba: true, links: { href: "https://x.test/a" } }).success,
    true,
  );
});

test("the seeded Impronta tenant id (version nibble 0) is accepted as a talent profile id", () => {
  const ok = scheduleItemInputSchema.safeParse({
    title: "Set",
    time_tba: true,
    performer_talent_profile_id: TENANT,
  });
  assert.equal(ok.success, true);
});

test("tenant_id and event_id are never client-supplied", () => {
  const r = scheduleItemInputSchema.safeParse({ title: "Set", time_tba: true, tenant_id: TENANT, event_id: EVENT });
  assert.equal(r.success, false);
});

// ── program settings ───────────────────────────────────────────────────────

test("program settings: empty object is every default (disabled)", () => {
  assert.deepEqual(normalizeEventProgramSettings({}), DEFAULT_PROGRAM_SETTINGS);
  assert.deepEqual(normalizeEventProgramSettings(null), DEFAULT_PROGRAM_SETTINGS);
  assert.deepEqual(normalizeEventProgramSettings("nope"), DEFAULT_PROGRAM_SETTINGS);
  assert.deepEqual(eventProgramSettingsSchema.parse({}), DEFAULT_PROGRAM_SETTINGS);
  assert.equal(DEFAULT_PROGRAM_SETTINGS.enabled, false);
  assert.equal(DEFAULT_PROGRAM_SETTINGS.heading, "Programa");
  assert.equal(DEFAULT_PROGRAM_SETTINGS.set_times_public, true);
  assert.equal(DEFAULT_PROGRAM_SETTINGS.group_by, "day");
});

test("program settings: a valid blob round-trips, including heading_i18n", () => {
  const s = normalizeEventProgramSettings({
    enabled: true,
    heading: "Lineup",
    heading_i18n: { es: "Cartel" },
    set_times_public: false,
    group_by: "stage",
  });
  assert.deepEqual(s, {
    enabled: true,
    heading: "Lineup",
    heading_i18n: { es: "Cartel" },
    set_times_public: false,
    group_by: "stage",
  });
});

test("program settings: one bad key does not switch a live program off", () => {
  const s = normalizeEventProgramSettings({ enabled: true, heading: "Programa", group_by: "hour", heading_i18n: { es: "" } });
  assert.equal(s.enabled, true);
  assert.equal(s.group_by, "day");
  assert.equal(s.heading_i18n, undefined);
});

// ── row normaliser ─────────────────────────────────────────────────────────

function row(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    tenant_id: TENANT,
    event_id: EVENT,
    kind: "set",
    title: "DJ Sofia",
    starts_at: "2026-11-22T03:00:00+00:00",
    ends_at: null,
    time_tba: false,
    status: "published",
    visibility: "public",
    sort_order: 0,
    media: {},
    links: {},
    sponsor: {},
    tags: ["house"],
    i18n: { es: { title: "DJ Sofía" } },
    ...extra,
  };
}

test("normalizeScheduleItemRow maps a row and normalises instants to ISO", () => {
  const item = normalizeScheduleItemRow(row());
  assert.ok(item);
  assert.equal(item.id, ID);
  assert.equal(item.kind, "set");
  assert.equal(item.startsAt, "2026-11-22T03:00:00.000Z");
  assert.equal(item.endsAt, null);
  assert.equal(item.timeTba, false);
  assert.deepEqual(item.tags, ["house"]);
  assert.deepEqual(item.i18n, { es: { title: "DJ Sofía" } });
  assert.equal(item.status, "published");
});

test("normalizeScheduleItemRow fails closed on identity and never throws on garbage", () => {
  assert.equal(normalizeScheduleItemRow(null), null);
  assert.equal(normalizeScheduleItemRow(row({ id: null })), null);
  assert.equal(normalizeScheduleItemRow(row({ title: "  " })), null);
  const item = normalizeScheduleItemRow(row({ kind: "dj", media: "[]", links: 4, i18n: { es: "x" }, tags: "a", sort_order: "3" }));
  assert.ok(item);
  assert.equal(item.kind, "other");
  assert.deepEqual(item.media, {});
  assert.deepEqual(item.links, {});
  assert.equal(item.i18n, undefined);
  assert.deepEqual(item.tags, []);
  assert.equal(item.sortOrder, 0);
});

test("a row with no usable start is TBA whatever the flag says", () => {
  const item = normalizeScheduleItemRow(row({ starts_at: "not a date", time_tba: false }));
  assert.ok(item);
  assert.equal(item.startsAt, null);
  assert.equal(item.timeTba, true);
});

test("an end before the start is dropped, not trusted", () => {
  const item = normalizeScheduleItemRow(row({ ends_at: "2026-11-22T02:00:00Z" }));
  assert.ok(item);
  assert.equal(item.endsAt, null);
});
