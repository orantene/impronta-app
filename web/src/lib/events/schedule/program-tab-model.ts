/**
 * program-tab-model.ts — the judgements the Programa tab makes, made once
 * here and tested (Wave 2, PR C).
 *
 * The tab's form holds STRINGS (a `datetime-local` value, a select value);
 * the action wants INSTANTS and ids. This module is the bridge, in the
 * venue's zone and nowhere else:
 *
 *   - `draftFromItem` / `emptyDraft`: a `ScheduleItem` (or nothing) → form.
 *   - `draftToInput`: the form → the pure model's `scheduleItemInputSchema`
 *     (snake_case, `model.ts`), so a bad end time or a missing start is a
 *     sentence on the form, never a round trip.
 *   - `toSaveWire`: the parsed input → the camelCase wire the staff action
 *     (`saveScheduleItem`, PR B) accepts, plus `eventId` / `id`.
 *   - `overlapNotes`, `moveTargets`, `movedOrder`: what the list needs to
 *     draw the amber note and the up / down buttons.
 *
 * Pure: no React, no Supabase, no `server-only`.
 */

import { localDateIn, localTimeIn, parseLocalTime, zonedWallClockToUtc } from "@/lib/sessions/recurrence";

import type { EventLabelLocale } from "../public-event-time";
import { detectOverlaps, sortScheduleItems, type ScheduleSpaceRef } from "./grouping";
import {
  scheduleItemInputSchema,
  type ScheduleItem,
  type ScheduleItemInput,
  type ScheduleItemKind,
  type ScheduleItemStatus,
} from "./model";

// ── Locale ─────────────────────────────────────────────────────────────────

/** The dashboard locale ("es-MX", "fr", "en") → the label locale the groupers speak. */
export function labelLocale(locale: string | null | undefined): EventLabelLocale {
  return (locale ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

// ── Venue-zone wall clock ⇄ instant ────────────────────────────────────────

/** ISO instant → the `datetime-local` value that reads the same on the venue's wall clock. "" when either side is unusable. */
export function isoToVenueLocal(iso: string | null, zone: string | null): string {
  if (!iso || !zone) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = localDateIn(d, zone);
  const time = localTimeIn(d, zone);
  return date && time ? `${date}T${time}` : "";
}

/**
 * A `datetime-local` value ("2026-11-21T18:00") read as the venue's wall
 * clock → the ISO instant. Null when the value is empty, malformed, the zone
 * is missing (a program refuses to publish a time it cannot place, like
 * sessions do), or the wall clock does not exist in that zone.
 */
export function venueLocalToIso(local: string, zone: string | null): string | null {
  const v = local.trim();
  if (!v || !zone) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(v);
  if (!m) return null;
  const minutes = parseLocalTime(m[2]!);
  if (minutes === null) return null;
  const at = zonedWallClockToUtc(m[1]!, minutes, zone);
  return at ? at.toISOString() : null;
}

// ── The form ───────────────────────────────────────────────────────────────

export type ProgramItemDraft = {
  title: string;
  kind: ScheduleItemKind;
  sessionId: string;
  startsLocal: string;
  endsLocal: string;
  timeTba: boolean;
  performerId: string;
  performerName: string;
  /** Display only: the chip's avatar. Never sent. */
  performerHeroUrl: string | null;
  performerTba: boolean;
  spaceId: string;
  coverMediaId: string;
  /** Display only: the MediaField's thumbnail. Never sent. */
  coverUrl: string | null;
  description: string;
  link: string;
  staffOnly: boolean;
  status: ScheduleItemStatus;
  sponsorName: string;
  sponsorUrl: string;
};

/** A blank row. `sessionId` defaults to the only night when there is exactly one (proposal §6). */
export function emptyDraft(sessionIds: ReadonlyArray<string>): ProgramItemDraft {
  return {
    title: "",
    kind: "set",
    sessionId: sessionIds.length === 1 ? sessionIds[0]! : "",
    startsLocal: "",
    endsLocal: "",
    timeTba: false,
    performerId: "",
    performerName: "",
    performerHeroUrl: null,
    performerTba: false,
    spaceId: "",
    coverMediaId: "",
    coverUrl: null,
    description: "",
    link: "",
    staffOnly: false,
    status: "draft",
    sponsorName: "",
    sponsorUrl: "",
  };
}

export function draftFromItem(item: ScheduleItem, zone: string | null): ProgramItemDraft {
  return {
    title: item.title,
    kind: item.kind,
    sessionId: item.sessionId ?? "",
    startsLocal: isoToVenueLocal(item.startsAt, zone),
    endsLocal: isoToVenueLocal(item.endsAt, zone),
    timeTba: item.timeTba,
    performerId: item.performerTalentProfileId ?? "",
    performerName: item.performerName ?? "",
    performerHeroUrl: null,
    performerTba: item.performerTba,
    spaceId: item.spaceId ?? "",
    coverMediaId: item.coverMediaId ?? "",
    coverUrl: null,
    description: item.description ?? "",
    link: item.links.href ?? "",
    staffOnly: item.visibility === "staff",
    status: item.status,
    sponsorName: item.sponsor.name ?? "",
    sponsorUrl: item.sponsor.url ?? "",
  };
}

export type DraftIssue = { field: keyof ProgramItemDraft | "form"; code: "title" | "start" | "zone" | "end" | "link" | "sponsorUrl" | "invalid" };

export type DraftToInputResult = { ok: true; input: ScheduleItemInput } | { ok: false; issue: DraftIssue };

/**
 * The form → the pure model's input, or the FIRST thing wrong with it as a
 * code the tab turns into a sentence. The venue zone is the only zone.
 */
export function draftToInput(draft: ProgramItemDraft, zone: string | null, sortOrder = 0): DraftToInputResult {
  const title = draft.title.trim();
  if (!title) return { ok: false, issue: { field: "title", code: "title" } };

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (!draft.timeTba) {
    if (!draft.startsLocal.trim()) return { ok: false, issue: { field: "startsLocal", code: "start" } };
    if (!zone) return { ok: false, issue: { field: "startsLocal", code: "zone" } };
    startsAt = venueLocalToIso(draft.startsLocal, zone);
    if (!startsAt) return { ok: false, issue: { field: "startsLocal", code: "start" } };
    if (draft.endsLocal.trim()) {
      endsAt = venueLocalToIso(draft.endsLocal, zone);
      if (!endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return { ok: false, issue: { field: "endsLocal", code: "end" } };
    }
  }

  const link = draft.link.trim();
  const sponsorName = draft.sponsorName.trim();
  const sponsorUrl = draft.sponsorUrl.trim();

  const candidate = {
    kind: draft.kind,
    title,
    subtitle: null,
    description: draft.description,
    session_id: draft.sessionId || null,
    space_id: draft.spaceId || null,
    starts_at: startsAt,
    ends_at: endsAt,
    time_tba: draft.timeTba,
    performer_talent_profile_id: draft.performerId || null,
    performer_name: draft.performerName,
    performer_tba: draft.performerTba,
    cover_media_id: draft.coverMediaId || null,
    media: {},
    links: link ? { href: link } : {},
    sponsor: { ...(sponsorName ? { name: sponsorName } : {}), ...(sponsorUrl ? { url: sponsorUrl } : {}) },
    tags: [],
    visibility: draft.staffOnly ? "staff" : "public",
    status: draft.status,
    sort_order: sortOrder,
    i18n: {},
  };

  const parsed = scheduleItemInputSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, input: parsed.data };

  const first = parsed.error.issues[0];
  const path = first?.path.map(String).join(".") ?? "";
  if (path === "links.href") return { ok: false, issue: { field: "link", code: "link" } };
  if (path.startsWith("sponsor")) return { ok: false, issue: { field: "sponsorUrl", code: "sponsorUrl" } };
  if (path === "starts_at") return { ok: false, issue: { field: "startsLocal", code: "start" } };
  if (path === "ends_at") return { ok: false, issue: { field: "endsLocal", code: "end" } };
  return { ok: false, issue: { field: "form", code: "invalid" } };
}

/** The camelCase wire `saveScheduleItem` (PR B) parses. `id` present = update. */
export type SaveScheduleItemWire = {
  id?: string;
  eventId: string;
  sessionId: string | null;
  spaceId: string | null;
  kind: ScheduleItemKind;
  title: string;
  subtitle: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeTba: boolean;
  performerTalentProfileId: string | null;
  performerName: string | null;
  performerTba: boolean;
  coverMediaId: string | null;
  media: { galleryMediaIds?: string[]; videoUrl?: string };
  links: { href?: string; label?: string; instagram?: string; website?: string };
  sponsor: { name?: string; logoMediaId?: string; url?: string };
  tags: string[];
  visibility: "public" | "staff";
  status: ScheduleItemStatus;
  i18n: Record<string, { title?: string; subtitle?: string; description?: string }>;
};

export function toSaveWire(input: ScheduleItemInput, eventId: string, id?: string | null): SaveScheduleItemWire {
  const media: SaveScheduleItemWire["media"] = {};
  if (input.media.gallery_media_ids) media.galleryMediaIds = input.media.gallery_media_ids;
  if (input.media.video_url) media.videoUrl = input.media.video_url;
  const sponsor: SaveScheduleItemWire["sponsor"] = {};
  if (input.sponsor.name) sponsor.name = input.sponsor.name;
  if (input.sponsor.logo_media_id) sponsor.logoMediaId = input.sponsor.logo_media_id;
  if (input.sponsor.url) sponsor.url = input.sponsor.url;
  return {
    ...(id ? { id } : {}),
    eventId,
    sessionId: input.session_id ?? null,
    spaceId: input.space_id ?? null,
    kind: input.kind,
    title: input.title,
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    startsAt: input.starts_at ?? null,
    endsAt: input.ends_at ?? null,
    timeTba: input.time_tba,
    performerTalentProfileId: input.performer_talent_profile_id ?? null,
    performerName: input.performer_name ?? null,
    performerTba: input.performer_tba,
    coverMediaId: input.cover_media_id ?? null,
    media,
    links: { ...input.links },
    sponsor,
    tags: input.tags,
    visibility: input.visibility,
    status: input.status,
    i18n: input.i18n,
  };
}

// ── List judgements ────────────────────────────────────────────────────────

export type OverlapNote = { withTitle: string; spaceName: string | null };

/** Per item id, the OTHER items it crosses in its space (proposal §4: an amber note, never a block). */
export function overlapNotes(items: ReadonlyArray<ScheduleItem>, spaces: ReadonlyArray<ScheduleSpaceRef>): Map<string, OverlapNote[]> {
  const spaceName = new Map<string, string>();
  for (const s of spaces) spaceName.set(s.id, s.name);
  const out = new Map<string, OverlapNote[]>();
  const add = (id: string, note: OverlapNote) => {
    const list = out.get(id) ?? [];
    list.push(note);
    out.set(id, list);
  };
  for (const o of detectOverlaps(items)) {
    const name = spaceName.get(o.spaceId) ?? null;
    add(o.a.id, { withTitle: o.b.title, spaceName: name });
    add(o.b.id, { withTitle: o.a.title, spaceName: name });
  }
  return out;
}

function startKey(item: ScheduleItem): string {
  if (item.timeTba || !item.startsAt) return "tba";
  const t = Date.parse(item.startsAt);
  return Number.isNaN(t) ? "tba" : String(t);
}

/**
 * Whether "move up" / "move down" can change anything for `id` among
 * `groupItems` (the rows drawn in its group, in display order). Time wins
 * over `sort_order` (§6), so a move is only offered against a neighbour that
 * starts at the same instant, or is also TBA.
 */
export function moveTargets(groupItems: ReadonlyArray<ScheduleItem>, id: string): { up: string | null; down: string | null } {
  const idx = groupItems.findIndex((i) => i.id === id);
  if (idx === -1) return { up: null, down: null };
  const me = groupItems[idx]!;
  const prev = idx > 0 ? groupItems[idx - 1]! : null;
  const next = idx < groupItems.length - 1 ? groupItems[idx + 1]! : null;
  return {
    up: prev && startKey(prev) === startKey(me) ? prev.id : null,
    down: next && startKey(next) === startKey(me) ? next.id : null,
  };
}

/**
 * The whole event's ids in their new order after swapping `id` with
 * `withId`: the full list is what `reorderScheduleItems` writes
 * (`sort_order = index`), so every row keeps a consistent slot.
 */
export function movedOrder(allItems: ReadonlyArray<ScheduleItem>, id: string, withId: string): string[] {
  const ids = sortScheduleItems(allItems).map((i) => i.id);
  const a = ids.indexOf(id);
  const b = ids.indexOf(withId);
  if (a === -1 || b === -1) return ids;
  [ids[a], ids[b]] = [ids[b]!, ids[a]!];
  return ids;
}
