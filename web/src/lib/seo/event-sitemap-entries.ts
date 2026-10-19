import type { MetadataRoute } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildLocaleAlternates } from "@/i18n/alternates";
import { eventPathWithoutLocale } from "@/lib/events/event-page-paths";
import { isGuestSellableOffering } from "@/lib/offerings/guest-sellable";

/**
 * Sitemap entries for PUBLIC EVENTS (`/events/<slug>`, `/es/eventos/<slug>`).
 *
 * Kept out of `app/sitemap.ts` (which several open PRs edit): that file only
 * imports `loadEventSitemapEntries` and appends its result.
 *
 * Rules: published events only (the RLS policy admits nothing else to anon, and
 * the query filters again); an event is listed while its latest scheduled night
 * has not started yet (future events only: a past event has nothing left to rank for); an event with no
 * scheduled night is not a dated event and is left out. `lastModified` is the
 * event row's own `updated_at`.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type EventSitemapRow = {
  slug: string;
  status: string;
  updatedAt: string | null;
  /**
   * The backing offering is published + approved + public (D-10). An event
   * whose offering is private, unlisted or pending is not a public event.
   */
  publiclyListed: boolean;
  /** Start of the latest scheduled night. */
  latestStartsAt: string | null;
};

export function eventSitemapEntries(
  rows: readonly EventSitemapRow[],
  opts: {
    origin: string | URL;
    defaultLocale: string;
    supportedLocales: readonly string[];
    now: Date;
  },
): MetadataRoute.Sitemap {
  const cutoff = opts.now.getTime();
  const out: MetadataRoute.Sitemap = [];
  for (const row of rows) {
    if (row.status !== "published" || !row.publiclyListed || !SLUG.test(row.slug) || !row.latestStartsAt) continue;
    const last = new Date(row.latestStartsAt).getTime();
    if (Number.isNaN(last) || last < cutoff) continue;
    const modified = row.updatedAt ? new Date(row.updatedAt) : opts.now;
    const lastModified = Number.isNaN(modified.getTime()) ? opts.now : modified;
    for (const locale of opts.supportedLocales) {
      const alt = buildLocaleAlternates({
        origin: opts.origin,
        pathnameWithoutLocale: eventPathWithoutLocale("en", row.slug),
        pathnameForLocale: (code) => eventPathWithoutLocale(code, row.slug),
        currentLocale: locale,
        defaultLocale: opts.defaultLocale,
        supportedLocales: opts.supportedLocales,
      });
      out.push({
        url: alt.canonical,
        lastModified,
        ...(alt.languages ? { alternates: { languages: alt.languages } } : {}),
      });
    }
  }
  return out;
}

const CHUNK = 100;
const PAGE = 1000;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Row = Record<string, unknown>;
type Page = PromiseLike<{ data: Row[] | null; error: unknown }>;
type PageBuilder = (from: number, to: number) => Page;

/** Every row of a query, `PAGE` at a time, so the PostgREST row cap can never silently truncate. */
async function fetchAll(build: PageBuilder): Promise<Row[] | null> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error || !data) return null;
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

/** Reads the tenant's published events + their latest night and builds the entries. Never throws. */
export async function loadEventSitemapEntries(input: {
  supabase: SupabaseClient;
  tenantId: string;
  origin: string | URL;
  defaultLocale: string;
  supportedLocales: readonly string[];
  now?: Date;
}): Promise<MetadataRoute.Sitemap> {
  const now = input.now ?? new Date();
  const db = input.supabase;
  try {
    const events = await fetchAll((a, b) =>
      db.from("events").select("id, slug, status, updated_at, offering_id")
        .eq("tenant_id", input.tenantId).eq("status", "published").order("id").range(a, b) as unknown as Page);
    if (!events || events.length === 0) return [];

    // Public + listed: the backing offering must be published, approved, public.
    const listedOfferings = new Set<string>();
    const offeringIds = [...new Set(events.map((e) => e.offering_id as string | null).filter((x): x is string => !!x))];
    for (const ids of chunks(offeringIds, CHUNK)) {
      const rows = await fetchAll((a, b) =>
        db.from("talent_offerings").select("id, status, moderation_state, visibility")
          .eq("tenant_id", input.tenantId).in("id", ids).order("id").range(a, b) as unknown as Page);
      if (!rows) return [];
      for (const o of rows) if (isGuestSellableOffering(o)) listedOfferings.add(o.id as string);
    }

    // Sessions in chunks of CHUNK event ids, each paged, so neither the id list
    // nor the 1000-row cap can drop an event.
    const latest = new Map<string, string>();
    for (const ids of chunks(events.map((e) => e.id as string), CHUNK)) {
      const rows = await fetchAll((a, b) =>
        db.from("sessions").select("event_id, starts_at").in("event_id", ids)
          .eq("status", "scheduled").order("starts_at").order("event_id").range(a, b) as unknown as Page);
      if (!rows) return [];
      for (const s of rows) {
        const id = s.event_id as string;
        const at = s.starts_at as string;
        if (!latest.has(id) || at > (latest.get(id) as string)) latest.set(id, at);
      }
    }

    return eventSitemapEntries(
      events.map((e) => ({
        slug: e.slug as string,
        status: e.status as string,
        updatedAt: (e.updated_at as string | null) ?? null,
        publiclyListed: !!e.offering_id && listedOfferings.has(e.offering_id as string),
        latestStartsAt: latest.get(e.id as string) ?? null,
      })),
      { origin: input.origin, defaultLocale: input.defaultLocale, supportedLocales: input.supportedLocales, now },
    );
  } catch {
    return [];
  }
}
