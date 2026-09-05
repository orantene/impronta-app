import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { pickTimezone } from "@/lib/spaces/venue-timezone";
import { doorsAt } from "@/lib/events/event-policy";
import { resolveLineupState } from "@/lib/events/lineup";
import { TicketPickerIsland } from "@/lib/site-admin/builder-node/ticket-picker-island";

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
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };
type Locale = "en" | "es";

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    dateTba: "Date to be announced",
    doors: "doors",
    at: "at",
    cta: "Get tickets",
    lineup: "Lineup",
    tickets: "Tickets",
    pickTicket: "Pick your ticket",
    with: "With",
    ageGate: "Ages {n}+",
    refunds: "Refunds until {h} hours before doors",
  },
  es: {
    dateTba: "Fecha por anunciar",
    doors: "puertas",
    at: "en",
    cta: "Conseguir entradas",
    lineup: "Cartel",
    tickets: "Entradas",
    pickTicket: "Elegí tu entrada",
    with: "Con",
    ageGate: "Mayores de {n}",
    refunds: "Reembolsos hasta {h} horas antes de puertas",
  },
};

function whenLabel(iso: string | null, timeZone: string, locale: Locale, withTime = true): string {
  if (!iso) return COPY[locale].dateTba;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return COPY[locale].dateTba;
  try {
    return d.toLocaleString(locale === "es" ? "es" : "en", {
      timeZone, weekday: "long", day: "numeric", month: "long",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  } catch {
    // Never silently answer in the reader's zone.
    return d.toISOString();
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

export default async function PublicEventPage({ params }: Params) {
  const { slug } = await params;
  const scope = await getPublicTenantScope();
  if (!scope) notFound();
  const supabase = await createClient();
  if (!supabase) notFound();

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("id, slug, title, description, doors_offset_minutes, age_gate, refund_cutoff_hours, venue_id, offering_id, cover_media_id")
    .eq("tenant_id", scope.tenantId).eq("status", "published").eq("slug", slug).maybeSingle();
  if (eventErr) { logServerError("events.publicDetail", eventErr); notFound(); }
  if (!event) notFound();

  const [{ data: sessionRows, error: sessionErr }, { data: venueRow, error: venueErr }, { data: agencyRow, error: agencyErr }, { data: cover, error: coverErr }] = await Promise.all([
    supabase.from("sessions").select("id, starts_at, ends_at, status").eq("event_id", event.id as string).eq("status", "scheduled").order("starts_at", { ascending: true }),
    event.venue_id ? supabase.from("venues").select("timezone, name").eq("id", event.venue_id as string).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("agencies").select("timezone, display_name, supported_locales").eq("id", scope.tenantId).maybeSingle(),
    event.cover_media_id ? supabase.from("media_assets").select("public_url, alt, width, height").eq("id", event.cover_media_id as string).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (sessionErr) { logServerError("events.publicDetail/sessions", sessionErr); notFound(); }
  if (venueErr) logServerError("events.publicDetail/venue", venueErr);
  if (agencyErr) logServerError("events.publicDetail/workspace", agencyErr);
  if (coverErr) logServerError("events.publicDetail/cover", coverErr);

  // The tenant's first supported locale decides the page language. A venue
  // whose site is Spanish-first gets Spanish; the reader's browser does not
  // decide, the venue does.
  const supported = (agencyRow?.supported_locales as string[] | null) ?? [];
  const locale: Locale = (supported[0] ?? "en").toLowerCase().startsWith("es") ? "es" : "en";
  const t = (k: string) => COPY[locale][k] ?? COPY.en[k] ?? k;

  const zone = pickTimezone({
    venue: (venueRow?.timezone as string | null) ?? null,
    workspace: (agencyRow?.timezone as string | null) ?? null,
  }).timezone;
  const venueName = (venueRow?.name as string | null) ?? (agencyRow?.display_name as string | null) ?? null;

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

  const eyebrow = `${whenLabel(nextAt, zone, locale, false)}${venueName ? ` · ${venueName}` : ""}`;
  const subLine = acts.length === 1 ? `${t("with")} ${acts[0]}` : null;
  const description = ((event.description as string | null) ?? "").trim();
  const coverUrl = (cover?.public_url as string | null) ?? null;

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6 sm:pb-10">
        {/* HERO — 60vh on a venue page, the event's own image the only colour */}
        <section
          className="relative -mx-4 flex min-h-[60vh] flex-col justify-end overflow-hidden rounded-none sm:-mx-6 sm:rounded-2xl"
          style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {coverUrl ? <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" /> : null}
          <div className={`relative p-6 sm:p-10 ${coverUrl ? "text-white" : ""}`}>
            <div className="text-xs uppercase tracking-wide opacity-80">{eyebrow}</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">{event.title as string}</h1>
            {subLine ? <p className="mt-2 text-base opacity-90 sm:text-lg">{subLine}</p> : null}
            {doors ? (
              <p className="mt-1 text-sm opacity-80">
                {t("doors")} {whenLabel(doors.toISOString(), zone, locale).split(", ").pop()}
              </p>
            ) : null}
            <a
              href="#tickets"
              className="mt-5 inline-block rounded-full bg-black px-5 py-3 text-sm font-semibold text-white sm:static sm:mt-5 max-sm:fixed max-sm:bottom-4 max-sm:left-4 max-sm:right-4 max-sm:z-20 max-sm:text-center"
            >
              {t("cta")}
            </a>
          </div>
        </section>

        {/* LINEUP — only above one act; an empty grid never renders */}
        {acts.length > 1 ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">{t("lineup")}</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {acts.map((a) => (
                <li key={a} className="rounded-xl border border-black/10 p-4 text-sm font-medium">{a}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* NOTE — one optional paragraph, no stats */}
        {description ? (
          <section className="mt-10">
            <p className="text-base leading-relaxed text-black/70">{description}</p>
            {(event.age_gate as number | null) || (event.refund_cutoff_hours as number | null) ? (
              <p className="mt-2 text-xs text-black/50">
                {event.age_gate ? t("ageGate").replace("{n}", String(event.age_gate)) : null}
                {event.age_gate && event.refund_cutoff_hours ? " · " : null}
                {event.refund_cutoff_hours ? t("refunds").replace("{h}", String(event.refund_cutoff_hours)) : null}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* TICKETS — the picker where the festival's pass cards were. It shows a
            working purchase or the honest state that names why; never a dead button. */}
        <section id="tickets" className="mt-10 scroll-mt-24">
          <div className="text-xs uppercase tracking-wide text-black/50">{t("tickets")}</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{t("pickTicket")}</h2>
          <div className="mt-4 rounded-2xl border border-black/10">
            <TicketPickerIsland tenantId={scope.tenantId} eventId={event.id as string} locale={locale} />
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
