/**
 * model.ts — the pure shape of an event's program.
 *
 * One row of `event_schedule_items` is one timed thing inside an event; the
 * words "Programa", "Lineup", "Agenda" are presentations of the same rows
 * (docs/plans/events-program/00-proposal.md §2, §3). This module is the wire
 * contract between the DB row, the server actions and the readers: zod
 * schemas for what comes IN (create / update payloads, the `events.program`
 * settings blob) and normalisers for what comes OUT (a raw row → `ScheduleItem`).
 *
 * Pure: no Supabase, no `server-only`, no React, so it gates in CI.
 */

import { z } from "zod";

import { normalizeNodeI18nOverlay, type BuilderNodeI18nOverlay } from "@/lib/site-admin/builder-node/i18n-overlay";

import { uuidWire } from "../uuid-wire";

// ── Table ──────────────────────────────────────────────────────────────────

export const EVENT_SCHEDULE_ITEMS_TABLE = "event_schedule_items" as const;

/** `events.program` (jsonb): the per-event program settings. */
export const EVENT_PROGRAM_COLUMN = "program" as const;

/** The columns every reader selects, in the migration's order. */
export const SCHEDULE_ITEM_COLUMNS =
  "id, tenant_id, event_id, session_id, space_id, kind, title, subtitle, description, starts_at, ends_at, time_tba, performer_talent_profile_id, performer_name, performer_tba, cover_media_id, media, links, sponsor, tags, visibility, status, sort_order, i18n, created_at, updated_at" as const;

// ── Kinds ──────────────────────────────────────────────────────────────────

/**
 * The closed list, mirrored by the CHECK in
 * `supabase/migrations/20261231249000_event_schedule_items.sql`. Adding a kind
 * is a migration AND an entry here; the static test pins the two together.
 */
export const SCHEDULE_ITEM_KINDS = [
  "set",
  "performance",
  "talk",
  "panel",
  "workshop",
  "class",
  "ceremony",
  "presentation",
  "service",
  "break",
  "competition",
  "meet_greet",
  "afterparty",
  "doors",
  "close",
  "other",
] as const;

export type ScheduleItemKind = (typeof SCHEDULE_ITEM_KINDS)[number];

export const scheduleItemKindSchema = z.enum(SCHEDULE_ITEM_KINDS);

/** Kinds whose row IS a performer slot: the ones a "Lineup" block filters to. */
export const PERFORMER_KINDS: ReadonlyArray<ScheduleItemKind> = ["set", "performance"];

export const SCHEDULE_ITEM_VISIBILITIES = ["public", "staff"] as const;
export type ScheduleItemVisibility = (typeof SCHEDULE_ITEM_VISIBILITIES)[number];
export const scheduleItemVisibilitySchema = z.enum(SCHEDULE_ITEM_VISIBILITIES);

export const SCHEDULE_ITEM_STATUSES = ["draft", "published"] as const;
export type ScheduleItemStatus = (typeof SCHEDULE_ITEM_STATUSES)[number];
export const scheduleItemStatusSchema = z.enum(SCHEDULE_ITEM_STATUSES);

// ── Limits (shared with the migration's CHECKs) ────────────────────────────

export const SCHEDULE_ITEM_LIMITS = {
  title: 200,
  subtitle: 200,
  description: 600,
  performerName: 200,
  galleryMax: 6,
} as const;

// ── Shared scalar helpers ──────────────────────────────────────────────────

/** An ISO instant (any offset) that `Date.parse` accepts; stored as timestamptz. */
const isoInstant = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Not an instant" });

const trimmedText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), { message: "http(s) only" });

// ── JSON sub-shapes ────────────────────────────────────────────────────────

export const scheduleItemMediaSchema = z
  .object({
    gallery_media_ids: z.array(uuidWire).max(SCHEDULE_ITEM_LIMITS.galleryMax).optional(),
    video_url: httpUrl.optional(),
  })
  .strict();

export const scheduleItemLinksSchema = z
  .object({
    href: httpUrl.optional(),
    label: z.string().trim().min(1).max(80).optional(),
    instagram: z.string().trim().min(1).max(80).optional(),
    website: httpUrl.optional(),
  })
  .strict();

export const scheduleItemSponsorSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    logo_media_id: uuidWire.optional(),
    url: httpUrl.optional(),
  })
  .strict();

export type ScheduleItemMedia = z.infer<typeof scheduleItemMediaSchema>;
export type ScheduleItemLinks = z.infer<typeof scheduleItemLinksSchema>;
export type ScheduleItemSponsor = z.infer<typeof scheduleItemSponsorSchema>;

/**
 * The per-row translation overlay: `{ es: { title, subtitle, description } }`.
 * Same normaliser the builder runs on every node, so a corrupt blob can never
 * reach a reader. Only the three text props are translatable.
 */
export const SCHEDULE_ITEM_I18N_PROPS = ["title", "subtitle", "description"] as const;
export type ScheduleItemI18nProp = (typeof SCHEDULE_ITEM_I18N_PROPS)[number];

export const scheduleItemI18nSchema = z.record(
  z.string().trim().min(2).max(10),
  z
    .object({
      title: z.string().trim().max(SCHEDULE_ITEM_LIMITS.title).optional(),
      subtitle: z.string().trim().max(SCHEDULE_ITEM_LIMITS.subtitle).optional(),
      description: z.string().trim().max(SCHEDULE_ITEM_LIMITS.description).optional(),
    })
    .strict(),
);

// ── Input (create / update payload) ────────────────────────────────────────

/**
 * What the admin sheet sends. Server actions parse with this, then add
 * `tenant_id` / `event_id` from the authenticated context; those are never
 * client-supplied and are deliberately absent here.
 *
 * Time rules (mirrored by the migration's CHECKs):
 *   - `time_tba=false` requires `starts_at`
 *   - `ends_at`, when present, is after `starts_at`
 */
export const scheduleItemInputSchema = z
  .object({
    kind: scheduleItemKindSchema.default("other"),
    title: trimmedText(SCHEDULE_ITEM_LIMITS.title),
    subtitle: optionalText(SCHEDULE_ITEM_LIMITS.subtitle),
    description: optionalText(SCHEDULE_ITEM_LIMITS.description),

    session_id: uuidWire.nullable().optional(),
    space_id: uuidWire.nullable().optional(),

    starts_at: isoInstant.nullable().optional(),
    ends_at: isoInstant.nullable().optional(),
    time_tba: z.boolean().default(false),

    performer_talent_profile_id: uuidWire.nullable().optional(),
    performer_name: optionalText(SCHEDULE_ITEM_LIMITS.performerName),
    performer_tba: z.boolean().default(false),

    cover_media_id: uuidWire.nullable().optional(),
    media: scheduleItemMediaSchema.default({}),
    links: scheduleItemLinksSchema.default({}),
    sponsor: scheduleItemSponsorSchema.default({}),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),

    visibility: scheduleItemVisibilitySchema.default("public"),
    status: scheduleItemStatusSchema.default("draft"),
    sort_order: z.number().int().min(-1_000_000).max(1_000_000).default(0),

    i18n: scheduleItemI18nSchema.default({}),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.time_tba && !v.starts_at) {
      ctx.addIssue({ code: "custom", path: ["starts_at"], message: "A start time is required unless the time is TBA" });
    }
    if (v.starts_at && v.ends_at && Date.parse(v.ends_at) <= Date.parse(v.starts_at)) {
      ctx.addIssue({ code: "custom", path: ["ends_at"], message: "End must be after start" });
    }
  });

export type ScheduleItemInput = z.infer<typeof scheduleItemInputSchema>;

// ── Program settings on `events.program` ───────────────────────────────────

export const PROGRAM_GROUP_BY = ["day", "stage", "none"] as const;
export type ProgramGroupBy = (typeof PROGRAM_GROUP_BY)[number];

export const DEFAULT_PROGRAM_HEADING = "Programa";

export const eventProgramSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    heading: z.string().trim().min(1).max(80).default(DEFAULT_PROGRAM_HEADING),
    heading_i18n: z.record(z.string().trim().min(2).max(10), z.string().trim().min(1).max(80)).optional(),
    set_times_public: z.boolean().default(true),
    group_by: z.enum(PROGRAM_GROUP_BY).default("day"),
  })
  .strip();

export type EventProgramSettings = {
  enabled: boolean;
  heading: string;
  heading_i18n?: Record<string, string>;
  set_times_public: boolean;
  group_by: ProgramGroupBy;
};

export const DEFAULT_PROGRAM_SETTINGS: EventProgramSettings = Object.freeze({
  enabled: false,
  heading: DEFAULT_PROGRAM_HEADING,
  set_times_public: true,
  group_by: "day",
}) as EventProgramSettings;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `events.program` → settings, never throwing. A missing / corrupt blob is
 * every default (program disabled); a partially valid blob keeps the fields
 * that parse and defaults the rest, field by field, so one bad key cannot
 * switch a live program off.
 */
export function normalizeEventProgramSettings(raw: unknown): EventProgramSettings {
  if (!isPlainObject(raw)) return { ...DEFAULT_PROGRAM_SETTINGS };
  const whole = eventProgramSettingsSchema.safeParse(raw);
  if (whole.success) return stripEmptyHeadingI18n(whole.data);

  // Field-by-field salvage.
  const out: EventProgramSettings = { ...DEFAULT_PROGRAM_SETTINGS };
  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
  if (typeof raw.heading === "string" && raw.heading.trim().length > 0) {
    out.heading = raw.heading.trim().slice(0, 80);
  }
  if (typeof raw.set_times_public === "boolean") out.set_times_public = raw.set_times_public;
  if (typeof raw.group_by === "string" && (PROGRAM_GROUP_BY as readonly string[]).includes(raw.group_by)) {
    out.group_by = raw.group_by as ProgramGroupBy;
  }
  const headingI18n = normalizeNodeI18nOverlay({ x: raw.heading_i18n })?.x;
  if (headingI18n) out.heading_i18n = headingI18n;
  return out;
}

function stripEmptyHeadingI18n(v: z.infer<typeof eventProgramSettingsSchema>): EventProgramSettings {
  const out: EventProgramSettings = {
    enabled: v.enabled,
    heading: v.heading,
    set_times_public: v.set_times_public,
    group_by: v.group_by,
  };
  if (v.heading_i18n && Object.keys(v.heading_i18n).length > 0) out.heading_i18n = v.heading_i18n;
  return out;
}

// ── Row → ScheduleItem ─────────────────────────────────────────────────────

export type ScheduleItem = {
  id: string;
  tenantId: string;
  eventId: string;
  sessionId: string | null;
  spaceId: string | null;
  kind: ScheduleItemKind;
  title: string;
  subtitle: string | null;
  description: string | null;
  /** ISO instant or null (TBA). */
  startsAt: string | null;
  /** ISO instant or null ("until the next item"). */
  endsAt: string | null;
  timeTba: boolean;
  performerTalentProfileId: string | null;
  performerName: string | null;
  performerTba: boolean;
  coverMediaId: string | null;
  media: ScheduleItemMedia;
  links: ScheduleItemLinks;
  sponsor: ScheduleItemSponsor;
  tags: string[];
  visibility: ScheduleItemVisibility;
  status: ScheduleItemStatus;
  sortOrder: number;
  i18n: BuilderNodeI18nOverlay | undefined;
  createdAt: string | null;
  updatedAt: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function instant(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function subShape<S extends z.ZodTypeAny>(schema: S, v: unknown): z.infer<S> {
  if (!isPlainObject(v)) return {} as z.infer<S>;
  const parsed = schema.safeParse(v);
  return parsed.success ? parsed.data : ({} as z.infer<S>);
}

/**
 * A raw DB row (or anything shaped like one) → `ScheduleItem`, or `null` when
 * the identity columns are missing. Never throws: a corrupt JSON blob becomes
 * `{}`, an unknown kind becomes `other`, an unparseable instant becomes null
 * (with `timeTba` forced on so the row cannot claim a time it does not have).
 */
export function normalizeScheduleItemRow(raw: unknown): ScheduleItem | null {
  if (!isPlainObject(raw)) return null;
  const id = str(raw.id);
  const tenantId = str(raw.tenant_id);
  const eventId = str(raw.event_id);
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!id || !tenantId || !eventId || title.length === 0) return null;

  const startsAt = instant(raw.starts_at);
  let endsAt = instant(raw.ends_at);
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = null;
  const timeTba = raw.time_tba === true || startsAt === null;

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim())
    : [];

  return {
    id,
    tenantId,
    eventId,
    sessionId: str(raw.session_id),
    spaceId: str(raw.space_id),
    kind: oneOf(SCHEDULE_ITEM_KINDS, raw.kind, "other"),
    title,
    subtitle: str(typeof raw.subtitle === "string" ? raw.subtitle.trim() : null),
    description: str(typeof raw.description === "string" ? raw.description.trim() : null),
    startsAt,
    endsAt,
    timeTba,
    performerTalentProfileId: str(raw.performer_talent_profile_id),
    performerName: str(typeof raw.performer_name === "string" ? raw.performer_name.trim() : null),
    performerTba: raw.performer_tba === true,
    coverMediaId: str(raw.cover_media_id),
    media: subShape(scheduleItemMediaSchema, raw.media),
    links: subShape(scheduleItemLinksSchema, raw.links),
    sponsor: subShape(scheduleItemSponsorSchema, raw.sponsor),
    tags,
    visibility: oneOf(SCHEDULE_ITEM_VISIBILITIES, raw.visibility, "public"),
    status: oneOf(SCHEDULE_ITEM_STATUSES, raw.status, "draft"),
    sortOrder: typeof raw.sort_order === "number" && Number.isFinite(raw.sort_order) ? Math.trunc(raw.sort_order) : 0,
    i18n: normalizeNodeI18nOverlay(raw.i18n),
    createdAt: instant(raw.created_at),
    updatedAt: instant(raw.updated_at),
  };
}

/** The public reader's filter, stated once: published, public, and (when linked) a live night. */
export function isPubliclyVisible(item: ScheduleItem): boolean {
  return item.status === "published" && item.visibility === "public";
}
