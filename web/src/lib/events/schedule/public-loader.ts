import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { resolvePublicZone } from "@/lib/events/public-event-time";
import { resolveTalentMediaForHub } from "@/lib/media/talent-media-for-hub";
import { readProgramSettings, sortScheduleRows } from "./row-shape";
import { EVENT_PROGRAM_COLUMN, EVENT_SCHEDULE_ITEMS_TABLE, SCHEDULE_ITEM_COLUMNS, type ScheduleItemKind, type ScheduleItemRow } from "./contract";

/**
 * THE PUBLIC READ of an event's program: what the `event_program` island
 * renders. Published + public rows of a published event with `program.enabled`,
 * performer and cover resolved, texts already in the visitor's locale, times
 * stripped when the venue has not made set times public.
 *
 * DEFENSIVE BY DESIGN. This PR ships ahead of (or beside) the migration, so a
 * missing table or a missing `program` column must read as "no program", never
 * as a 500 on every event page. Every read that fails logs and degrades to
 * `enabled: false`; every enrichment read (talent, media, spaces, venue) fails
 * to its fallback and never hides the item.
 */

export type ProgramLocale = "en" | "es";

export type PublicScheduleItem = {
  id: string;
  kind: ScheduleItemKind;
  title: string;
  subtitle: string | null;
  description: string | null;
  /** Null when `setTimesPublic` is false, when TBA, or when the row has none. */
  startsAt: string | null;
  endsAt: string | null;
  timeTba: boolean;
  sessionId: string | null;
  spaceId: string | null;
  performer: {
    name: string;
    tba: boolean;
    /** `/t/<code>` when a PUBLIC talent profile is linked; otherwise null. */
    profileHref: string | null;
    heroUrl: string | null;
    instagram: string | null;
  } | null;
  /** The item's own cover, or the linked talent's hero. */
  coverUrl: string | null;
  links: { href: string | null; label: string | null; instagram: string | null; website: string | null };
  sponsor: { name: string; logoUrl: string | null; url: string | null } | null;
  tags: string[];
  sortOrder: number;
};

export type PublicEventProgram =
  | { enabled: false }
  | {
      enabled: true;
      heading: string;
      setTimesPublic: boolean;
      groupBy: "day" | "stage" | "none";
      /** The venue zone (venue → workspace). Null when neither names one: times then render as "to be confirmed". */
      zone: string | null;
      nights: Array<{ sessionId: string; label: string; startsAt: string }>;
      spaces: Array<{ id: string; name: string; kind: string }>;
      items: PublicScheduleItem[];
    };

const OFF: PublicEventProgram = { enabled: false };

async function one<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null | undefined> {
  const { data, error } = await q;
  if (error) {
    logServerError(`events.program.public/${label}`, error);
    return undefined;
  }
  return (data ?? null) as T | null;
}

async function many<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[] | undefined> {
  const { data, error } = await q;
  if (error) {
    logServerError(`events.program.public/${label}`, error);
    return undefined;
  }
  return (data ?? []) as T[];
}

/** "sáb 21 nov" / "Sat, Nov 21" in the venue zone; a numbered night when no zone is known. */
export function nightLabel(iso: string, zone: string | null, locale: ProgramLocale, index: number): string {
  if (!zone) return locale === "es" ? `Noche ${index + 1}` : `Night ${index + 1}`;
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", { timeZone: zone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
  } catch {
    return locale === "es" ? `Noche ${index + 1}` : `Night ${index + 1}`;
  }
}

function localized(row: ScheduleItemRow, locale: ProgramLocale, key: "title" | "subtitle" | "description"): string | null {
  const overlay = locale === "en" ? undefined : row.i18n?.[locale]?.[key];
  const base = overlay && overlay.trim() ? overlay : row[key];
  return base && base.trim() ? base : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

type TalentHead = { id: string; display_name: string | null; first_name: string | null; profile_code: string | null; workflow_status: string | null; visibility: string | null; deleted_at: string | null };

export async function loadPublicEventProgram(
  admin: SupabaseClient,
  input: { tenantId: string; eventId: string; locale: ProgramLocale },
): Promise<PublicEventProgram> {
  const { tenantId, eventId, locale } = input;

  // The event and its switch. A missing `program` column errors here and the
  // block simply does not render (§7: nothing is rebuilt in the builder).
  const ev = await one<{ id: string; status: string | null; venue_id: string | null; program: unknown }>(
    "event",
    admin.from("events").select(`id, status, venue_id, ${EVENT_PROGRAM_COLUMN}`).eq("tenant_id", tenantId).eq("id", eventId).maybeSingle(),
  );
  if (!ev || ev.status !== "published") return OFF;
  const settings = readProgramSettings(ev.program);
  if (!settings.enabled) return OFF;

  // Published + public rows only. A missing table errors here: `enabled: false`.
  const rows = await many<ScheduleItemRow>(
    "items",
    admin.from(EVENT_SCHEDULE_ITEMS_TABLE).select(SCHEDULE_ITEM_COLUMNS).eq("tenant_id", tenantId).eq("event_id", eventId).eq("status", "published").eq("visibility", "public"),
  );
  if (rows === undefined) return OFF;

  // Nights = scheduled sessions of the event (§6: group by the night, never the calendar date).
  const [sessions, venue, workspace] = await Promise.all([
    many<{ id: string; starts_at: string; status: string | null }>(
      "sessions",
      admin.from("sessions").select("id, starts_at, status").eq("tenant_id", tenantId).eq("event_id", eventId).eq("status", "scheduled").order("starts_at", { ascending: true }),
    ),
    ev.venue_id ? one<{ timezone: string | null }>("venue", admin.from("venues").select("timezone").eq("tenant_id", tenantId).eq("id", ev.venue_id).maybeSingle()) : Promise.resolve(null),
    one<{ timezone: string | null }>("workspace", admin.from("agencies").select("timezone").eq("id", tenantId).maybeSingle()),
  ]);
  const zone = resolvePublicZone({ venue: venue?.timezone ?? null, workspace: workspace?.timezone ?? null });
  const liveSessionIds = new Set((sessions ?? []).map((s) => s.id));
  const nights = (sessions ?? []).map((s, i) => ({ sessionId: s.id, label: nightLabel(s.starts_at, zone, locale, i), startsAt: s.starts_at }));

  // §10: a cancelled night hides its items. A FAILED sessions read is not a
  // cancelled night: with no answer, every item stays.
  const visible = sortScheduleRows(sessions === undefined ? rows : rows.filter((r) => !r.session_id || liveSessionIds.has(r.session_id)));

  // Enrichment, each to its fallback.
  const talentIds = [...new Set(visible.map((r) => r.performer_talent_profile_id).filter((x): x is string => !!x))];
  const spaceIds = [...new Set(visible.map((r) => r.space_id).filter((x): x is string => !!x))];
  const mediaIds = [...new Set(visible.flatMap((r) => [r.cover_media_id, str(r.sponsor?.logo_media_id)]).filter((x): x is string => !!x))];

  const [talents, talentMedia, spaces, media] = await Promise.all([
    talentIds.length
      ? many<TalentHead>("talent", admin.from("talent_profiles").select("id, display_name, first_name, profile_code, workflow_status, visibility, deleted_at").in("id", talentIds))
      : Promise.resolve([] as TalentHead[]),
    talentIds.length ? resolveTalentMediaForHub(admin, { tenantId, talentProfileIds: talentIds }).catch((err) => { logServerError("events.program.public/talentMedia", err); return new Map(); }) : Promise.resolve(new Map()),
    spaceIds.length
      ? many<{ id: string; name: string; kind: string }>("spaces", admin.from("spaces").select("id, name, kind").eq("tenant_id", tenantId).in("id", spaceIds))
      : Promise.resolve([] as Array<{ id: string; name: string; kind: string }>),
    mediaIds.length
      ? many<{ id: string; public_url: string | null }>("media", admin.from("media_assets").select("id, public_url").in("id", mediaIds))
      : Promise.resolve([] as Array<{ id: string; public_url: string | null }>),
  ]);

  const talentById = new Map((talents ?? []).map((t) => [t.id, t]));
  const urlByMedia = new Map((media ?? []).map((m) => [m.id, m.public_url]));
  const spaceList = (spaces ?? []).map((s) => ({ id: s.id, name: s.name, kind: s.kind }));

  const items: PublicScheduleItem[] = visible.map((r) => {
    const talent = r.performer_talent_profile_id ? talentById.get(r.performer_talent_profile_id) : undefined;
    // §10: a profile unpublished after linking falls back to the stored name and photo.
    const talentPublic = !!talent && !talent.deleted_at && talent.visibility === "public" && (talent.workflow_status === "published" || talent.workflow_status === "approved");
    const talentName = talent ? ((talent.display_name ?? talent.first_name) ?? "").trim() : "";
    const performerName = (r.performer_name ?? "").trim() || talentName;
    const heroUrl = r.performer_talent_profile_id ? (talentMedia.get(r.performer_talent_profile_id)?.coverUrl ?? null) : null;
    const coverUrl = (r.cover_media_id ? urlByMedia.get(r.cover_media_id) ?? null : null) ?? heroUrl;
    const showTimes = settings.set_times_public && !r.time_tba;
    const sponsorName = str(r.sponsor?.name);
    return {
      id: r.id,
      kind: r.kind,
      title: localized(r, locale, "title") ?? r.title,
      subtitle: localized(r, locale, "subtitle"),
      description: localized(r, locale, "description"),
      startsAt: showTimes ? r.starts_at : null,
      endsAt: showTimes ? r.ends_at : null,
      timeTba: r.time_tba || !r.starts_at,
      sessionId: r.session_id,
      spaceId: r.space_id,
      performer:
        r.performer_tba || performerName
          ? {
              name: performerName,
              tba: r.performer_tba,
              profileHref: talentPublic && talent?.profile_code ? `/t/${talent.profile_code}` : null,
              heroUrl,
              // The talent's own socials live in field values behind a plan gate;
              // the item's link is the only cheap, honest source here.
              instagram: str(r.links?.instagram),
            }
          : null,
      coverUrl,
      links: { href: str(r.links?.href), label: str(r.links?.label), instagram: str(r.links?.instagram), website: str(r.links?.website) },
      sponsor: sponsorName ? { name: sponsorName, logoUrl: r.sponsor?.logo_media_id ? urlByMedia.get(r.sponsor.logo_media_id) ?? null : null, url: str(r.sponsor?.url) } : null,
      tags: Array.isArray(r.tags) ? r.tags : [],
      sortOrder: r.sort_order,
    };
  });

  const heading = (locale !== "en" && settings.heading_i18n?.[locale]?.trim()) || settings.heading;
  return {
    enabled: true,
    heading,
    setTimesPublic: settings.set_times_public,
    groupBy: settings.group_by,
    zone,
    nights,
    spaces: spaceList,
    items,
  };
}
