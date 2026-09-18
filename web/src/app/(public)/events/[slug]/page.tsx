import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { readPublicEventContext } from "@/lib/events/public-event-context";
import { resolvePublicZone } from "@/lib/events/public-event-time";
import { doorsAt } from "@/lib/events/event-policy";
import { resolveLineupState } from "@/lib/events/lineup";
import { loadTicketPicker } from "@/app/(public)/_events/ticket-picker-actions";
import CmsPublicPage, { generateMetadata as cmsPageMetadata } from "@/app/(public)/p/[[...slug]]/page";
import { getRequestLocale } from "@/i18n/request-locale";
import { resolveLinkedBuilderPage } from "@/lib/events/event-page-link";
import { eventPathWithoutLocale } from "@/lib/events/event-page-paths";
import { buildTenantLocaleAlternates } from "@/lib/seo/locale-alternates";
import { EventPageView, type Locale } from "./event-page-view";

/**
 * `/events/<slug>` — one event on a venue's own site (E5 step 4, the design half).
 *
 * Grown from the Creative Director's `page-designs/festival.ts` under their
 * ruling for a VENUE page (board: "Creative Director — /events/<slug> on a
 * venue site"):
 *   - DROPPED, always: the festival's own nav and footer (the venue's header
 *     and footer own identity and navigation), the cinematic band, the stats
 *     row (three nights / three stages are festival facts).
 *   - SURVIVE, always: eyebrow (date · the venue's own name, never a city),
 *     title, sub line, ONE call to action that scrolls to the picker and, at
 *     375, sticks to the bottom edge because the picker is below the fold.
 *   - The passes section is the TICKET section: the `ticket_picker` island
 *     where the pass cards were, so the page always shows a working purchase
 *     or the honest state that names why.
 *   - The note survives as one optional description paragraph, no stats.
 *   - CONDITIONAL: the lineup renders only with more than one act; one act
 *     folds into the sub line; zero acts, no section — an empty grid never
 *     renders.
 *   - LOOK: the venue site's theme tokens; the festival's dark palette does not
 *     travel; only the event's own cover image brings colour. Hero 60vh, not
 *     full viewport. EN and ES on every string. No em dashes.
 *
 * PUBLISHED ONLY, enforced twice (the query and the RLS policy). Times in the
 * VENUE'S zone, never the reader's. NO remaining counts anywhere on this page.
 *
 * THE BUILDER PAGE, WHEN THERE IS ONE (`events.page_id`, owner ask 2026-09-17):
 * an event whose operator built its landing page in the website builder gets
 * THAT page rendered here, at the event's canonical URL (`/events/<slug>`,
 * `/es/eventos/<slug>`), through the exact storefront path `/p/<slug>` uses
 * (locale, metadata, site shell, analytics). The engine view above is the
 * fallback when no page is linked or the linked page is not published. The
 * builder page's own URL (`/lumina`) 308s here, so one document has one URL.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };
/**
 * hreflang for the event's canonical pair: `en` → `/events/<slug>`, `es` →
 * `/es/eventos/<slug>` (the tenant's own grammar decides which is unprefixed).
 * `availableLocales` narrows the set to the languages the linked page is
 * really published in, exactly as `/p/<slug>` does for its own metadata.
 */
function eventAlternates(locale: string, slug: string, availableLocales?: readonly string[]) {
  return buildTenantLocaleAlternates(locale, eventPathWithoutLocale(locale, slug), {
    pathnameForLocale: (code) => eventPathWithoutLocale(code, slug),
    ...(availableLocales && availableLocales.length > 0 ? { availableLocales } : {}),
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // The event's own name, not the slug de-hyphenated and lowercased (#1874).
  const scope = await getPublicTenantScope();
  const supabase = scope ? await createClient() : null;
  const { data } = supabase
    ? await supabase.from("events").select("title, page_id").eq("tenant_id", scope!.tenantId).eq("status", "published").eq("slug", slug).maybeSingle()
    : { data: null };
  if (!data) return { title: slug.replace(/-/g, " ") };
  const locale = await getRequestLocale();
  const page = supabase && scope ? await resolveLinkedBuilderPage(supabase, scope.tenantId, data.page_id as string | null) : null;
  if (page) {
    // The page's own SEO (title, description, og image, robots; JSON-LD is in
    // the body), re-rooted to the event URL: `/p/<slug>` alternates are dropped
    // and replaced, exactly as the home role does for an assigned home page.
    const pageMeta = await cmsPageMetadata({ params: Promise.resolve({ slug: page.slug.split("/") }) });
    return { ...pageMeta, alternates: undefined, ...(await eventAlternates(locale, slug, page.publishedLocales)) };
  }
  return { title: data.title as string, ...(await eventAlternates(locale, slug)) };
}

export default async function PublicEventPage({ params }: Params) {
  const { slug } = await params;
  const scope = await getPublicTenantScope();
  if (!scope) {
    logServerError("events.publicDetail", new Error("no public tenant scope"));
    notFound();
  }
  const supabase = await createClient();
  if (!supabase) {
    logServerError("events.publicDetail", new Error("createClient returned null"));
    notFound();
  }

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("id, slug, title, description, doors_offset_minutes, age_gate, refund_cutoff_hours, venue_id, offering_id, cover_media_id, page_id")
    .eq("tenant_id", scope.tenantId).eq("status", "published").eq("slug", slug).maybeSingle();
  if (eventErr) { logServerError("events.publicDetail", eventErr); notFound(); }
  if (!event) {
    logServerError("events.publicDetail", new Error(`no published event for slug=${slug} tenant=${scope.tenantId}`));
    notFound();
  }

  // The builder page IS the event page when one is linked and published.
  // `redirectWhenLinkedToEvent={false}`: this IS the canonical URL, and the
  // catch-all would otherwise send the visitor back here forever.
  const linkedPage = await resolveLinkedBuilderPage(supabase, scope.tenantId, (event.page_id as string | null) ?? null);
  if (linkedPage) {
    return (
      <CmsPublicPage
        params={Promise.resolve({ slug: linkedPage.slug.split("/") })}
        redirectWhenLinkedToEvent={false}
        // The `event_program` block binds to THIS event; no second link read.
        linkedEvent={{ id: event.id as string, slug: event.slug as string, title: (event.title as string | null) ?? "" }}
      />
    );
  }

  const [{ data: sessionRows, error: sessionErr }, ctx, { data: cover, error: coverErr }] = await Promise.all([
    supabase.from("sessions").select("id, starts_at, ends_at, status").eq("event_id", event.id as string).eq("status", "scheduled").order("starts_at", { ascending: true }),
    readPublicEventContext({ tenantId: scope.tenantId, venueId: (event.venue_id as string | null) ?? null }),
    event.cover_media_id ? supabase.from("media_assets").select("public_url, alt, width, height").eq("id", event.cover_media_id as string).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (sessionErr) { logServerError("events.publicDetail/sessions", sessionErr); notFound(); }
  if (coverErr) logServerError("events.publicDetail/cover", coverErr);

  // The tenant's first supported locale decides the page language. A venue
  // whose site is Spanish-first gets Spanish; the reader's browser does not
  // decide, the venue does.
  const supported = (ctx.supportedLocales as string[] | null) ?? [];
  const locale: Locale = (supported[0] ?? "en").toLowerCase().startsWith("es") ? "es" : "en";

  // Venue → workspace, NEVER the platform rung: no zone, no date (#1874).
  const zone = resolvePublicZone({ venue: ctx.venueTimezone, workspace: ctx.workspaceTimezone });
  const venueName = ctx.venueName ?? ctx.workspaceDisplayName ?? null;

  const nowIso = new Date().toISOString();
  const sessions = sessionRows ?? [];
  const nextAt = (sessions.find((s) => (s.starts_at as string) >= nowIso)?.starts_at as string) ?? null;
  const doors = doorsAt(nextAt ?? "", (event.doors_offset_minutes as number | null) ?? 0);

  // THE LINEUP: only confirmed acts are public (engine rule), and the section
  // only exists above one act. Read: inquiries carrying this event → the
  // booked ones → their performer participants → display names.
  let acts: string[] = [];
  const { data: inqRows, error: inqErr } = await supabase.from("inquiries").select("id, status").eq("event_id", event.id as string);
  if (inqErr) logServerError("events.publicDetail/lineup", inqErr);
  const bookedIds = (inqRows ?? []).filter((i) => resolveLineupState({ inquiryStatus: i.status as string }) === "booked").map((i) => i.id as string);
  if (bookedIds.length > 0) {
    const { data: parts, error: pErr } = await supabase.from("inquiry_participants").select("inquiry_id, talent_profile_id, status").in("inquiry_id", bookedIds).not("talent_profile_id", "is", null);
    if (pErr) logServerError("events.publicDetail/participants", pErr);
    const ids = [...new Set((parts ?? []).filter((p) => p.status !== "declined" && p.status !== "removed").map((p) => p.talent_profile_id as string))];
    if (ids.length > 0) {
      const { data: profiles, error: prErr } = await supabase.from("talent_profiles").select("id, display_name, first_name").in("id", ids);
      if (prErr) logServerError("events.publicDetail/profiles", prErr);
      acts = (profiles ?? []).map((p) => ((p.display_name as string | null) ?? (p.first_name as string | null) ?? "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    }
  }

  // Seed the island on the server so the guest sees nights/tiers on first
  // paint. The client action path stays as a refresh after a refused buy; it
  // is not what first paints the picker.
  const picker = await loadTicketPicker({
    tenantId: scope.tenantId,
    eventId: event.id as string,
  });
  const islandPreload =
    picker.ok
      ? {
          eventTitle: picker.eventTitle,
          currency: picker.currency,
          timeZone: picker.timeZone,
          tiers: picker.tiers,
          nights: picker.nights,
        }
      : null;

  return (
    <>
      <PublicHeader />
      <EventPageView
        tenantId={scope.tenantId}
        eventId={event.id as string}
        title={event.title as string}
        description={((event.description as string | null) ?? "").trim()}
        locale={locale}
        zone={zone}
        venueName={venueName}
        nextAt={nextAt}
        doorsAtIso={doors ? doors.toISOString() : null}
        acts={acts}
        coverUrl={(cover?.public_url as string | null) ?? null}
        ageGate={(event.age_gate as number | null) ?? null}
        refundCutoffHours={(event.refund_cutoff_hours as number | null) ?? null}
        islandPreload={islandPreload}
      />
      <PublicFooter />
    </>
  );
}
