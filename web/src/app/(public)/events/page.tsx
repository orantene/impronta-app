import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { readPublicEventContext } from "@/lib/events/public-event-context";
import { whenLabel } from "@/lib/events/public-event-time";
import { pickTimezone } from "@/lib/spaces/venue-timezone";

/**
 * `/events` — the tenant's public list of what is on.
 *
 * Registered in the surface allow-list as `CANONICAL_EVENTS_PREFIX`, agency and
 * hub only: an event slug means nothing without a tenant to look it up under,
 * and two venues can both have a `noche-de-salsa`. Without that entry the proxy
 * rewrites to `/_page-not-found` BEFORE Next routing runs, so this file would
 * exist and still serve an HTML 404.
 *
 * PUBLISHED ONLY, AND THAT IS ENFORCED TWICE. The query filters on
 * `status = 'published'`, and the RLS policy on `events` independently allows
 * anon to read only published rows. A draft is a working document and a
 * cancelled event must stop being listed the moment it is cancelled — neither
 * should be one forgotten `.eq()` away from public.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
};

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  doors_offset_minutes: number | null;
  venue_id: string | null;
};

export default async function PublicEventsPage() {
  const scope = await getPublicTenantScope();
  if (!scope) notFound();

  const supabase = await createClient();
  if (!supabase) notFound();

  // `error` is destructured and acted on. PostgREST does not throw: an RLS
  // refusal returns `{ data: null, error }`, and ignoring it would render "no
  // events" — a failure indistinguishable from a venue with nothing on.
  const { data: eventRows, error: eventErr } = await supabase
    .from("events")
    .select("id, slug, title, description, doors_offset_minutes, venue_id")
    .eq("tenant_id", scope.tenantId)
    .eq("status", "published")
    .limit(100);

  if (eventErr) {
    logServerError("events.publicList", eventErr);
    notFound();
  }

  const events = (eventRows ?? []) as Row[];
  const eventIds = events.map((e) => e.id);

  const { data: sessionRows, error: sessionErr } = eventIds.length
    ? await supabase
        .from("sessions")
        .select("event_id, starts_at, status")
        .in("event_id", eventIds)
        .eq("status", "scheduled")
        .order("starts_at", { ascending: true })
    : { data: [] as Array<Record<string, unknown>>, error: null };

  if (sessionErr) {
    logServerError("events.publicList/sessions", sessionErr);
    notFound();
  }

  // Venue + workspace zones the anon client cannot read (RLS): `venues` is
  // staff-only and `agencies` has no anon SELECT policy. Read server-side by
  // key, timezone only. Before this every night listed here rendered in UTC
  // while looking entirely normal.
  const venueIds = [...new Set(events.map((e) => e.venue_id).filter((v): v is string => Boolean(v)))];
  const contexts = await Promise.all(
    venueIds.map(async (id) => [id, await readPublicEventContext({ tenantId: scope.tenantId, venueId: id })] as const),
  );
  const workspaceCtx =
    contexts[0]?.[1] ?? (await readPublicEventContext({ tenantId: scope.tenantId, venueId: null }));
  const venueZone = new Map<string, string | null>(contexts.map(([id, c]) => [id, c.venueTimezone]));
  const agencyRow = { timezone: workspaceCtx.workspaceTimezone };

  const nowIso = new Date().toISOString();

  const cards = events
    .map((e) => {
      const next =
        (sessionRows ?? []).find(
          (s) => s.event_id === e.id && (s.starts_at as string) >= nowIso,
        ) ?? null;
      // No sentinel key: an event with no venue has NO venue zone, not the zone
      // of the empty string.
      const zone = pickTimezone({
        venue: e.venue_id ? (venueZone.get(e.venue_id) ?? null) : null,
        workspace: (agencyRow?.timezone as string | null) ?? null,
      }).timezone;
      return { ...e, nextAt: (next?.starts_at as string | undefined) ?? null, zone };
    })
    // Soonest first; an event with no scheduled night sorts last rather than
    // being hidden — it is published, so the venue means people to see it.
    .sort((a, b) => (a.nextAt ?? "9999").localeCompare(b.nextAt ?? "9999"));

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>

        {cards.length === 0 ? (
          <p className="mt-4 text-sm text-black/60">
            Nothing on sale right now. Check back soon.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {cards.map((e) => (
              <li key={e.id} className="rounded-xl border border-black/10 p-5">
                <a href={`/events/${e.slug}`} className="block">
                  <div className="text-xs uppercase tracking-wide text-black/50">
                    {whenLabel(e.nextAt, e.zone)}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold">{e.title}</h2>
                  {e.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-black/60">{e.description}</p>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PublicFooter />
    </>
  );
}
