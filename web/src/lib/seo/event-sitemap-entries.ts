import type { MetadataRoute } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildLocaleAlternates } from "@/i18n/alternates";
import { eventPathWithoutLocale } from "@/lib/events/event-page-paths";

/**
 * Sitemap entries for PUBLIC EVENTS (`/events/<slug>`, `/es/eventos/<slug>`).
 *
 * Kept out of `app/sitemap.ts` (which several open PRs edit): that file only
 * imports `loadEventSitemapEntries` and appends its result.
 *
 * Rules: published events only (the RLS policy admits nothing else to anon, and
 * the query filters again); an event is listed while its latest scheduled night
 * is in the future or ended within the last `RECENT_DAYS`; an event with no
 * scheduled night is not a dated event and is left out. `lastModified` is the
 * event row's own `updated_at`.
 */

export const EVENT_SITEMAP_RECENT_DAYS = 14;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type EventSitemapRow = {
  slug: string;
  status: string;
  updatedAt: string | null;
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
  const cutoff = opts.now.getTime() - EVENT_SITEMAP_RECENT_DAYS * 86_400_000;
  const out: MetadataRoute.Sitemap = [];
  for (const row of rows) {
    if (row.status !== "published" || !SLUG.test(row.slug) || !row.latestStartsAt) continue;
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

/** Reads the tenant's published events + their latest night and builds the entries. Never throws. */
export async function loadEventSitemapEntries(input: {
  supabase: SupabaseClient;
  tenantId: string;
  origin: string | URL;
  defaultLocale: string;
  supportedLocales: readonly string[];
  now?: Date;
}): Promise<MetadataRoute.Sitemap> {
  try {
    const { data: events, error } = await input.supabase
      .from("events")
      .select("id, slug, status, updated_at")
      .eq("tenant_id", input.tenantId)
      .eq("status", "published")
      .limit(1000);
    if (error || !events || events.length === 0) return [];
    const { data: sessions, error: sErr } = await input.supabase
      .from("sessions")
      .select("event_id, starts_at")
      .in("event_id", events.map((e) => e.id as string))
      .eq("status", "scheduled");
    if (sErr) return [];
    const latest = new Map<string, string>();
    for (const s of sessions ?? []) {
      const id = s.event_id as string;
      const at = s.starts_at as string;
      if (!latest.has(id) || at > (latest.get(id) as string)) latest.set(id, at);
    }
    return eventSitemapEntries(
      events.map((e) => ({
        slug: e.slug as string,
        status: e.status as string,
        updatedAt: (e.updated_at as string | null) ?? null,
        latestStartsAt: latest.get(e.id as string) ?? null,
      })),
      {
        origin: input.origin,
        defaultLocale: input.defaultLocale,
        supportedLocales: input.supportedLocales,
        now: input.now ?? new Date(),
      },
    );
  } catch {
    return [];
  }
}
