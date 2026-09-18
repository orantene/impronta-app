/**
 * Event schedule items: the ROW CONTRACT for the IO layer (Wave 1, PR B).
 *
 * TEMPORARY DUPLICATE, BY AGREEMENT. PR A owns the migration and the pure
 * model (`model.ts`, `grouping.ts`, `i18n.ts` in this folder). This file
 * mirrors §3 of `docs/plans/events-program/00-proposal.md` column for column so
 * the two branches can be built in parallel and merged by CONTRACT: on merge,
 * delete this file and point the imports below at PR A's `model.ts`. Nothing
 * here may drift from §3, and nothing here computes anything.
 */

export const EVENT_SCHEDULE_ITEMS_TABLE = "event_schedule_items" as const;

/** `events.program` (jsonb) — the per-event program settings. */
export const EVENT_PROGRAM_COLUMN = "program" as const;

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

export const SCHEDULE_ITEM_VISIBILITIES = ["public", "staff"] as const;
export type ScheduleItemVisibility = (typeof SCHEDULE_ITEM_VISIBILITIES)[number];

export const SCHEDULE_ITEM_STATUSES = ["draft", "published"] as const;
export type ScheduleItemStatus = (typeof SCHEDULE_ITEM_STATUSES)[number];

export const PROGRAM_GROUP_BY = ["day", "stage", "none"] as const;
export type ProgramGroupBy = (typeof PROGRAM_GROUP_BY)[number];

/** The short description cap from §3. */
export const SCHEDULE_ITEM_DESCRIPTION_MAX = 600;
/** Gallery cap from §3. */
export const SCHEDULE_ITEM_GALLERY_MAX = 6;

export type ScheduleItemMedia = {
  gallery_media_ids?: string[];
  video_url?: string;
};

export type ScheduleItemLinks = {
  href?: string;
  label?: string;
  instagram?: string;
  website?: string;
};

export type ScheduleItemSponsor = {
  name?: string;
  logo_media_id?: string;
  url?: string;
};

/** Same overlay shape the builder uses: `{ es: { title, subtitle, description } }`. */
export type ScheduleItemI18n = Partial<
  Record<string, { title?: string; subtitle?: string; description?: string }>
>;

/** One row of `public.event_schedule_items`, exactly as §3 names the columns. */
export type ScheduleItemRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  session_id: string | null;
  space_id: string | null;
  kind: ScheduleItemKind;
  title: string;
  subtitle: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  time_tba: boolean;
  performer_talent_profile_id: string | null;
  performer_name: string | null;
  performer_tba: boolean;
  cover_media_id: string | null;
  media: ScheduleItemMedia;
  links: ScheduleItemLinks;
  sponsor: ScheduleItemSponsor;
  tags: string[];
  visibility: ScheduleItemVisibility;
  status: ScheduleItemStatus;
  sort_order: number;
  i18n: ScheduleItemI18n;
  created_at: string;
  updated_at: string;
};

/** The columns every reader selects, in §3 order. */
export const SCHEDULE_ITEM_COLUMNS =
  "id, tenant_id, event_id, session_id, space_id, kind, title, subtitle, description, starts_at, ends_at, time_tba, performer_talent_profile_id, performer_name, performer_tba, cover_media_id, media, links, sponsor, tags, visibility, status, sort_order, i18n, created_at, updated_at" as const;

/** `events.program` jsonb, §3. */
export type EventProgramSettings = {
  enabled: boolean;
  heading: string;
  heading_i18n?: Partial<Record<string, string>>;
  set_times_public: boolean;
  group_by: ProgramGroupBy;
};

export const DEFAULT_EVENT_PROGRAM_SETTINGS: EventProgramSettings = {
  enabled: false,
  heading: "Programa",
  set_times_public: true,
  group_by: "day",
};
