import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { logServerError } from "@/lib/server/safe-error";
import { resolveLineupState } from "@/lib/events/lineup";
import { resolveTalentMediaForHub } from "@/lib/media/talent-media-for-hub";
import { uuidWire } from "@/lib/events/uuid-wire";
import { sortScheduleRows } from "./grouping";
import {
  EVENT_PROGRAM_COLUMN,
  EVENT_SCHEDULE_ITEMS_TABLE,
  SCHEDULE_ITEM_COLUMNS,
  eventProgramSettingsSchema,
  normalizeEventProgramSettings,
  scheduleItemInputSchema,
  type EventProgramSettings,
  type ScheduleItemInput,
} from "./model";

/**
 * THE SCHEDULE ITEM WRITERS AND READERS — one implementation, called by the
 * staff actions in `_events-schedule-actions.ts` behind the workspace guard.
 *
 * Same stance as `lib/events/writers.ts`: nothing here decides WHO may write.
 * Every function takes the tenant id explicitly and scopes every read and
 * write by it, so the service-role client carries no authority of its own.
 * Every foreign key an item can carry is checked INSIDE the tenant before the
 * write: a `session_id` must be a session of THIS event, a `space_id` a space
 * of the event's venue, a `performer_talent_profile_id` a member of the roster
 * or a public talent. An id from anywhere else is refused, never stored.
 *
 * Every read goes through `one()` / `many()`: PostgREST does not throw, and a
 * dropped error reads as "nothing here" (see `quality/supabase-unchecked-read`).
 */

async function one<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null | undefined> {
  const { data, error } = await q;
  if (error) {
    logServerError(`events.schedule/${label}`, error);
    return undefined;
  }
  return (data ?? null) as T | null;
}

async function many<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[] | undefined> {
  const { data, error } = await q;
  if (error) {
    logServerError(`events.schedule/${label}`, error);
    return undefined;
  }
  return (data ?? []) as T[];
}

export type Refusal = { ok: false; error: string };
const refuse = (error: string): Refusal => ({ ok: false, error });

const LOAD_FAILED = "Could not load the program.";
const SAVE_FAILED = "Could not save the program item.";
const NOT_AN_EVENT = "That is not an event in this workspace.";
const NOT_AN_ITEM = "That is not a program item of this workspace.";

// ─── The row ──────────────────────────────────────────────────────────────────

/**
 * One `event_schedule_items` row as `SCHEDULE_ITEM_COLUMNS` selects it: the
 * persisted input (`model.ts`) plus identity and timestamps. This is what the
 * list action hands the tab, verbatim; readers that want camelCase run
 * `normalizeScheduleItemRow` on it.
 */
export type ScheduleItemRow = Required<ScheduleItemInput> & {
  id: string;
  tenant_id: string;
  event_id: string;
  created_at: string;
  updated_at: string;
};

// ─── The wire ─────────────────────────────────────────────────────────────────

/**
 * `saveScheduleItem` speaks camelCase (the sheet's wire, fixed since PR B).
 * Nothing here judges a value: the wire is renamed column for column and
 * handed to `scheduleItemInputSchema`, so the ONE rule for what a program item
 * may hold lives in `model.ts`. Unknown keys are dropped, as the old wire
 * schema stripped them. Only the two ids the model deliberately refuses
 * (`eventId`, `id`) are parsed here, and both are checked inside the tenant
 * before anything is written.
 */
const wireIdentitySchema = z.object({ id: uuidWire.optional(), eventId: uuidWire });

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `{ a: x, b: undefined }` → `{ a: x }`, so an absent wire key stays absent and the model's default applies. */
function present(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function pick(o: unknown, keys: Record<string, string>): Record<string, unknown> | undefined {
  if (!isPlainObject(o)) return undefined;
  return present(Object.fromEntries(Object.entries(keys).map(([wire, column]) => [column, o[wire]])));
}

const TOP_LEVEL = {
  sessionId: "session_id",
  spaceId: "space_id",
  kind: "kind",
  title: "title",
  subtitle: "subtitle",
  description: "description",
  startsAt: "starts_at",
  endsAt: "ends_at",
  timeTba: "time_tba",
  performerTalentProfileId: "performer_talent_profile_id",
  performerName: "performer_name",
  performerTba: "performer_tba",
  coverMediaId: "cover_media_id",
  tags: "tags",
  visibility: "visibility",
  status: "status",
  i18n: "i18n",
} as const;
const MEDIA = { galleryMediaIds: "gallery_media_ids", videoUrl: "video_url" } as const;
const LINKS = { href: "href", label: "label", instagram: "instagram", website: "website" } as const;
const SPONSOR = { name: "name", logoMediaId: "logo_media_id", url: "url" } as const;

/** The camelCase wire → the snake_case shape `scheduleItemInputSchema` reads. */
export function scheduleItemWireToInput(raw: unknown): Record<string, unknown> {
  const w = isPlainObject(raw) ? raw : {};
  return present({
    ...pick(w, TOP_LEVEL),
    media: pick(w.media, MEDIA),
    links: pick(w.links, LINKS),
    sponsor: pick(w.sponsor, SPONSOR),
  });
}

type ParsedWire = { id: string | undefined; eventId: string; input: ScheduleItemInput };

function parseScheduleItemWire(raw: unknown): ParsedWire | Refusal {
  const ids = wireIdentitySchema.safeParse(raw);
  if (!ids.success) return refuse(ids.error.issues[0]?.message ?? "That is not a valid program item.");
  const parsed = scheduleItemInputSchema.safeParse(scheduleItemWireToInput(raw));
  if (!parsed.success) return refuse(parsed.error.issues[0]?.message ?? "That is not a valid program item.");
  return { id: ids.data.id, eventId: ids.data.eventId, input: parsed.data };
}

/** `saveEventProgramSettings` speaks camelCase too; every key but the switch is optional and keeps its stored value. */
const PROGRAM_SETTINGS = { enabled: "enabled", heading: "heading", headingI18n: "heading_i18n", setTimesPublic: "set_times_public", groupBy: "group_by" } as const;

// ─── Ownership checks ─────────────────────────────────────────────────────────

type EventHead = { id: string; venue_id: string | null; program: unknown };

async function eventInTenant(admin: SupabaseClient, tenantId: string, eventId: string): Promise<EventHead | Refusal> {
  const ev = await one<EventHead>(
    "event",
    admin.from("events").select(`id, venue_id, ${EVENT_PROGRAM_COLUMN}`).eq("tenant_id", tenantId).eq("id", eventId).maybeSingle(),
  );
  if (ev === undefined) return refuse(LOAD_FAILED);
  if (!ev) return refuse(NOT_AN_EVENT);
  return ev;
}

function isRefusal(x: unknown): x is Refusal {
  return typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;
}

async function sessionBelongsToEvent(admin: SupabaseClient, tenantId: string, eventId: string, sessionId: string): Promise<boolean | undefined> {
  const row = await one<{ id: string }>(
    "session",
    admin.from("sessions").select("id").eq("tenant_id", tenantId).eq("event_id", eventId).eq("id", sessionId).maybeSingle(),
  );
  return row === undefined ? undefined : !!row;
}

async function spaceBelongsToVenue(admin: SupabaseClient, tenantId: string, venueId: string, spaceId: string): Promise<boolean | undefined> {
  const row = await one<{ id: string }>(
    "space",
    admin.from("spaces").select("id").eq("tenant_id", tenantId).eq("venue_id", venueId).eq("id", spaceId).maybeSingle(),
  );
  return row === undefined ? undefined : !!row;
}

/** Roster first (any active member), then any public talent on the platform. */
async function performerIsLinkable(admin: SupabaseClient, tenantId: string, talentProfileId: string): Promise<boolean | undefined> {
  const roster = await one<{ id: string }>(
    "performer.roster",
    admin.from("agency_talent_roster").select("id").eq("tenant_id", tenantId).eq("talent_profile_id", talentProfileId).eq("status", "active").maybeSingle(),
  );
  if (roster === undefined) return undefined;
  if (roster) return true;
  const pub = await one<{ id: string }>(
    "performer.public",
    admin.from("talent_profiles").select("id").eq("id", talentProfileId).in("workflow_status", ["approved", "published"]).eq("visibility", "public").is("deleted_at", null).maybeSingle(),
  );
  if (pub === undefined) return undefined;
  return !!pub;
}

// ─── Readers ──────────────────────────────────────────────────────────────────

export type ListScheduleItemsResult = { ok: true; items: ScheduleItemRow[]; settings: EventProgramSettings } | Refusal;

export async function listScheduleItemRows(admin: SupabaseClient, tenantId: string, eventId: string): Promise<ListScheduleItemsResult> {
  const ev = await eventInTenant(admin, tenantId, eventId);
  if (isRefusal(ev)) return ev;
  const rows = await many<ScheduleItemRow>(
    "list",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).select(SCHEDULE_ITEM_COLUMNS).eq("tenant_id", tenantId).eq("event_id", eventId).order("starts_at", { ascending: true }).order("sort_order", { ascending: true }),
  );
  if (rows === undefined) return refuse(LOAD_FAILED);
  return { ok: true, items: sortScheduleRows(rows), settings: normalizeEventProgramSettings(ev.program) };
}

// ─── Writers ──────────────────────────────────────────────────────────────────

export type SaveScheduleItemResult = { ok: true; id: string } | Refusal;

function toRowPayload(input: ScheduleItemInput, tenantId: string, eventId: string) {
  return {
    tenant_id: tenantId,
    event_id: eventId,
    session_id: input.session_id ?? null,
    space_id: input.space_id ?? null,
    kind: input.kind,
    title: input.title,
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    starts_at: input.time_tba ? null : (input.starts_at ?? null),
    ends_at: input.time_tba ? null : (input.ends_at ?? null),
    time_tba: input.time_tba,
    performer_talent_profile_id: input.performer_talent_profile_id ?? null,
    performer_name: input.performer_name ?? null,
    performer_tba: input.performer_tba,
    cover_media_id: input.cover_media_id ?? null,
    media: input.media,
    links: input.links,
    sponsor: input.sponsor,
    tags: input.tags,
    visibility: input.visibility,
    status: input.status,
    i18n: input.i18n,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Create (no `id`) or update (with `id`). Every foreign key is checked inside
 * the tenant first; the write itself is scoped by tenant and event again, and
 * an update that matches no row is a refusal rather than a silent success.
 */
export async function saveScheduleItemRow(admin: SupabaseClient, tenantId: string, raw: unknown): Promise<SaveScheduleItemResult> {
  const wire = parseScheduleItemWire(raw);
  if (isRefusal(wire)) return wire;
  const { id, eventId, input } = wire;

  const ev = await eventInTenant(admin, tenantId, eventId);
  if (isRefusal(ev)) return ev;

  if (input.session_id) {
    const okSession = await sessionBelongsToEvent(admin, tenantId, eventId, input.session_id);
    if (okSession === undefined) return refuse(LOAD_FAILED);
    if (!okSession) return refuse("That night does not belong to this event.");
  }
  if (input.space_id) {
    if (!ev.venue_id) return refuse("This event has no venue, so it has no places to choose from.");
    const okSpace = await spaceBelongsToVenue(admin, tenantId, ev.venue_id, input.space_id);
    if (okSpace === undefined) return refuse(LOAD_FAILED);
    if (!okSpace) return refuse("That place does not belong to this event's venue.");
  }
  if (input.performer_talent_profile_id) {
    const okPerformer = await performerIsLinkable(admin, tenantId, input.performer_talent_profile_id);
    if (okPerformer === undefined) return refuse(LOAD_FAILED);
    if (!okPerformer) return refuse("That performer is not on the roster and is not a public talent.");
  }

  const payload = toRowPayload(input, tenantId, eventId);

  if (id) {
    const updated = await many<{ id: string }>(
      "update",
      admin.from(EVENT_SCHEDULE_ITEMS_TABLE).update(payload).eq("tenant_id", tenantId).eq("event_id", eventId).eq("id", id).select("id"),
    );
    if (updated === undefined) return refuse(SAVE_FAILED);
    if (updated.length === 0) return refuse(NOT_AN_ITEM);
    return { ok: true, id };
  }

  const last = await many<{ sort_order: number }>(
    "nextSort",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).select("sort_order").eq("tenant_id", tenantId).eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1),
  );
  if (last === undefined) return refuse(SAVE_FAILED);
  const sortOrder = (last[0]?.sort_order ?? -1) + 1;
  const inserted = await many<{ id: string }>(
    "insert",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).insert({ ...payload, sort_order: sortOrder }).select("id"),
  );
  if (inserted === undefined || !inserted[0]?.id) return refuse(SAVE_FAILED);
  return { ok: true, id: inserted[0].id };
}

export type DeleteScheduleItemResult = { ok: true } | Refusal;

export async function deleteScheduleItemRow(admin: SupabaseClient, tenantId: string, itemId: string): Promise<DeleteScheduleItemResult> {
  const deleted = await many<{ id: string }>(
    "delete",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).delete().eq("tenant_id", tenantId).eq("id", itemId).select("id"),
  );
  if (deleted === undefined) return refuse("Could not delete the program item.");
  if (deleted.length === 0) return refuse(NOT_AN_ITEM);
  return { ok: true };
}

export const DUPLICATE_SUFFIX = " (copia)";

/** A copy lands as a DRAFT right after the original, whatever the original's status: a duplicate that is public before anyone edited it is a surprise. */
export async function duplicateScheduleItemRow(admin: SupabaseClient, tenantId: string, itemId: string): Promise<SaveScheduleItemResult> {
  const src = await one<ScheduleItemRow>(
    "duplicate.read",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).select(SCHEDULE_ITEM_COLUMNS).eq("tenant_id", tenantId).eq("id", itemId).maybeSingle(),
  );
  if (src === undefined) return refuse(LOAD_FAILED);
  if (!src) return refuse(NOT_AN_ITEM);
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
  void _id; void _c; void _u;
  const copy = {
    ...rest,
    tenant_id: tenantId,
    title: `${src.title}${DUPLICATE_SUFFIX}`,
    status: "draft" as const,
    sort_order: src.sort_order + 1,
    updated_at: new Date().toISOString(),
  };
  const inserted = await many<{ id: string }>("duplicate.insert", admin.from(EVENT_SCHEDULE_ITEMS_TABLE).insert(copy).select("id"));
  if (inserted === undefined || !inserted[0]?.id) return refuse(SAVE_FAILED);
  return { ok: true, id: inserted[0].id };
}

export type ReorderScheduleItemsResult = { ok: true; count: number } | Refusal;

/**
 * Writes `sort_order = index` for the given ids. Every id must be an item of
 * THIS event in THIS tenant, or nothing is written: a partial reorder leaves
 * two rows claiming one slot.
 */
export async function reorderScheduleItemRows(admin: SupabaseClient, tenantId: string, eventId: string, orderedIds: string[]): Promise<ReorderScheduleItemsResult> {
  const ids = [...new Set(orderedIds)];
  if (ids.length === 0) return { ok: true, count: 0 };
  const owned = await many<{ id: string }>(
    "reorder.owned",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).select("id").eq("tenant_id", tenantId).eq("event_id", eventId).in("id", ids),
  );
  if (owned === undefined) return refuse(LOAD_FAILED);
  if (owned.length !== ids.length) return refuse("One of those items is not a program item of this event.");
  for (let i = 0; i < ids.length; i++) {
    const r = await many<{ id: string }>(
      "reorder.write",
      admin.from(EVENT_SCHEDULE_ITEMS_TABLE).update({ sort_order: i, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("event_id", eventId).eq("id", ids[i]).select("id"),
    );
    if (r === undefined) return refuse("Could not save the new order.");
  }
  return { ok: true, count: ids.length };
}

export type SaveEventProgramSettingsResult = { ok: true; settings: EventProgramSettings } | Refusal;

/**
 * Partial by design: the switch is the one key the wire must carry; every
 * other key keeps its stored value. The merged blob is then judged by the
 * model's `eventProgramSettingsSchema`, the one rule for `events.program`.
 */
export async function saveEventProgramSettingsRow(admin: SupabaseClient, tenantId: string, eventId: string, raw: unknown): Promise<SaveEventProgramSettingsResult> {
  const wire = pick(raw, PROGRAM_SETTINGS);
  if (!wire || typeof wire.enabled !== "boolean") return refuse("Those are not valid program settings.");
  const ev = await eventInTenant(admin, tenantId, eventId);
  if (isRefusal(ev)) return ev;
  const current = normalizeEventProgramSettings(ev.program);
  const parsed = eventProgramSettingsSchema.safeParse({ ...current, ...wire });
  if (!parsed.success) return refuse("Those are not valid program settings.");
  const next: EventProgramSettings = { ...parsed.data };
  if (!next.heading_i18n || Object.keys(next.heading_i18n).length === 0) delete next.heading_i18n;
  const updated = await many<{ id: string }>(
    "settings",
    admin.from("events").update({ [EVENT_PROGRAM_COLUMN]: next, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", eventId).select("id"),
  );
  if (updated === undefined) return refuse("Could not save the program settings.");
  if (updated.length === 0) return refuse(NOT_AN_EVENT);
  return { ok: true, settings: next };
}

// ─── The one bridge from the booking spine ────────────────────────────────────

export type ImportLineupResult = { ok: true; created: number; skipped: number } | Refusal;

/**
 * "Añadir desde el cartel": every BOOKED inquiry act of this event becomes one
 * `set` item, talent linked, time TBA, as a draft. Idempotent by performer:
 * an act that already has an item on this event is skipped, so running it
 * twice adds nothing. Booking state stays on the inquiry; nothing is written
 * back to the spine.
 */
export async function importLineupAsScheduleItemRows(admin: SupabaseClient, tenantId: string, eventId: string): Promise<ImportLineupResult> {
  const ev = await eventInTenant(admin, tenantId, eventId);
  if (isRefusal(ev)) return ev;

  const inquiries = await many<{ id: string; status: string | null }>(
    "import.inquiries",
    admin.from("inquiries").select("id, status").eq("tenant_id", tenantId).eq("event_id", eventId),
  );
  if (inquiries === undefined) return refuse(LOAD_FAILED);
  const bookedIds = inquiries.filter((i) => resolveLineupState({ inquiryStatus: i.status }) === "booked").map((i) => i.id);
  if (bookedIds.length === 0) return { ok: true, created: 0, skipped: 0 };

  const parts = await many<{ inquiry_id: string; talent_profile_id: string | null; status: string | null }>(
    "import.participants",
    admin.from("inquiry_participants").select("inquiry_id, talent_profile_id, status").in("inquiry_id", bookedIds).not("talent_profile_id", "is", null),
  );
  if (parts === undefined) return refuse(LOAD_FAILED);
  const talentIds = [...new Set(parts.filter((p) => p.status !== "declined" && p.status !== "removed" && p.talent_profile_id).map((p) => p.talent_profile_id as string))];
  if (talentIds.length === 0) return { ok: true, created: 0, skipped: 0 };

  const existing = await many<{ performer_talent_profile_id: string | null }>(
    "import.existing",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).select("performer_talent_profile_id").eq("tenant_id", tenantId).eq("event_id", eventId).in("performer_talent_profile_id", talentIds),
  );
  if (existing === undefined) return refuse(LOAD_FAILED);
  const already = new Set(existing.map((e) => e.performer_talent_profile_id).filter(Boolean) as string[]);
  const fresh = talentIds.filter((id) => !already.has(id));
  if (fresh.length === 0) return { ok: true, created: 0, skipped: talentIds.length };

  const profiles = await many<{ id: string; display_name: string | null; first_name: string | null }>(
    "import.profiles",
    admin.from("talent_profiles").select("id, display_name, first_name").in("id", fresh),
  );
  if (profiles === undefined) return refuse(LOAD_FAILED);
  const nameById = new Map(profiles.map((p) => [p.id, ((p.display_name ?? p.first_name) ?? "").trim()]));

  const last = await many<{ sort_order: number }>(
    "import.nextSort",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).select("sort_order").eq("tenant_id", tenantId).eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1),
  );
  if (last === undefined) return refuse(SAVE_FAILED);
  let sortOrder = (last[0]?.sort_order ?? -1) + 1;

  const now = new Date().toISOString();
  const rows = fresh.map((talentId) => ({
    tenant_id: tenantId,
    event_id: eventId,
    session_id: null,
    space_id: null,
    kind: "set",
    title: nameById.get(talentId) || "Artista",
    subtitle: null,
    description: null,
    starts_at: null,
    ends_at: null,
    time_tba: true,
    performer_talent_profile_id: talentId,
    performer_name: null,
    performer_tba: false,
    cover_media_id: null,
    media: {},
    links: {},
    sponsor: {},
    tags: [],
    visibility: "public",
    status: "draft",
    sort_order: sortOrder++,
    i18n: {},
    updated_at: now,
  }));
  const inserted = await many<{ id: string }>("import.insert", admin.from(EVENT_SCHEDULE_ITEMS_TABLE).insert(rows).select("id"));
  if (inserted === undefined) return refuse(SAVE_FAILED);
  return { ok: true, created: inserted.length, skipped: talentIds.length - fresh.length };
}

// ─── Pickers ──────────────────────────────────────────────────────────────────

export type PerformerOption = { id: string; name: string; heroUrl: string | null; source: "roster" | "public" };
export type SearchPerformersResult = { ok: true; performers: PerformerOption[] } | Refusal;

const PICKER_LIMIT = 12;
type ProfileHead = { id: string; display_name: string | null; first_name: string | null; last_name: string | null };

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function profileName(p: ProfileHead): string {
  return ((p.display_name ?? "").trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()) || "";
}

/** Roster first, then public talent; each list matched on the display name. An empty query lists the roster alone. */
export async function searchPerformerRows(admin: SupabaseClient, tenantId: string, query: string): Promise<SearchPerformersResult> {
  const q = query.trim().slice(0, 80);
  const roster = await many<{ talent_profile_id: string }>(
    "performers.roster",
    admin.from("agency_talent_roster").select("talent_profile_id").eq("tenant_id", tenantId).eq("status", "active").limit(400),
  );
  if (roster === undefined) return refuse(LOAD_FAILED);
  const rosterIds = [...new Set(roster.map((r) => r.talent_profile_id))];

  const out: PerformerOption[] = [];
  if (rosterIds.length > 0) {
    let rq = admin.from("talent_profiles").select("id, display_name, first_name, last_name").in("id", rosterIds).is("deleted_at", null).limit(PICKER_LIMIT);
    if (q) rq = rq.ilike("display_name", `%${escapeLike(q)}%`);
    const rows = await many<ProfileHead>("performers.rosterProfiles", rq);
    if (rows === undefined) return refuse(LOAD_FAILED);
    for (const p of rows) out.push({ id: p.id, name: profileName(p), heroUrl: null, source: "roster" });
  }
  if (q && out.length < PICKER_LIMIT) {
    const rows = await many<ProfileHead>(
      "performers.public",
      admin.from("talent_profiles").select("id, display_name, first_name, last_name").ilike("display_name", `%${escapeLike(q)}%`).in("workflow_status", ["approved", "published"]).eq("visibility", "public").is("deleted_at", null).limit(PICKER_LIMIT),
    );
    if (rows === undefined) return refuse(LOAD_FAILED);
    const seen = new Set(out.map((o) => o.id));
    for (const p of rows) {
      if (seen.has(p.id) || out.length >= PICKER_LIMIT) continue;
      out.push({ id: p.id, name: profileName(p), heroUrl: null, source: "public" });
    }
  }
  if (out.length > 0) {
    const media = await resolveTalentMediaForHub(admin, { tenantId, talentProfileIds: out.map((o) => o.id) });
    for (const o of out) o.heroUrl = media.get(o.id)?.coverUrl ?? null;
  }
  return { ok: true, performers: out };
}

export type SpaceOption = { id: string; name: string; kind: string; code: string | null };

const PROGRAM_SPACE_KINDS_FIRST = ["stage", "room", "area"];

/** Stage / room / area first, then the venue's own order, then the name: the picker's order, not the program's. */
function rankSpaces<T extends { kind: string; name: string; sort_order?: number }>(rows: T[]): T[] {
  const rank = (k: string) => { const i = PROGRAM_SPACE_KINDS_FIRST.indexOf(k); return i === -1 ? PROGRAM_SPACE_KINDS_FIRST.length : i; };
  return [...rows].sort((a, b) => rank(a.kind) - rank(b.kind) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
}
export type ListEventSpacesResult = { ok: true; venueId: string | null; spaces: SpaceOption[] } | Refusal;

/** The active spaces of the event's venue, stage / room / area first. No venue → an empty list, not an error. */
export async function listEventSpaceRows(admin: SupabaseClient, tenantId: string, eventId: string): Promise<ListEventSpacesResult> {
  const ev = await eventInTenant(admin, tenantId, eventId);
  if (isRefusal(ev)) return ev;
  if (!ev.venue_id) return { ok: true, venueId: null, spaces: [] };
  const rows = await many<{ id: string; name: string; kind: string; code: string | null; sort_order: number }>(
    "spaces",
    admin.from("spaces").select("id, name, kind, code, sort_order").eq("tenant_id", tenantId).eq("venue_id", ev.venue_id).eq("status", "active").order("sort_order", { ascending: true }).limit(200),
  );
  if (rows === undefined) return refuse(LOAD_FAILED);
  return { ok: true, venueId: ev.venue_id, spaces: rankSpaces(rows).map((s) => ({ id: s.id, name: s.name, kind: s.kind, code: s.code })) };
}
