import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { pickTimezone } from "@/lib/spaces/venue-timezone";
import { saleState, type Tier } from "@/lib/events/tiers";
import { doorsAt } from "@/lib/events/event-policy";

/**
 * `/events/<slug>` — one event's public page.
 *
 * NO PURCHASE PATH YET, deliberately. This page shows what is on, when doors
 * are, and what the tiers cost. Buying needs the ticket picker block, guest
 * checkout and the receipt, and shipping a "Get tickets" button that does
 * nothing would be a dead CTA on the one page where a dead CTA costs a sale.
 * The prices are shown because a visitor deciding whether to come needs them;
 * the button waits until it works.
 *
 * REMAINING COUNTS ARE ALSO ABSENT, for the reason recorded in the admin
 * surface: availability is derived from `capacity_allocations` and the single
 * authority for that derivation answers one pool at a time. A "212 left" here
 * that disagrees with what the reserve RPC refuses is how a room gets oversold.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

function whenLabel(iso: string | null, timeZone: string): string {
  if (!iso) return "Date to be announced";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date to be announced";
  try {
    return d.toLocaleString(undefined, {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function PublicEventPage({ params }: Params) {
  const { slug } = await params;
  const scope = await getPublicTenantScope();
  if (!scope) notFound();

  const supabase = await createClient();
  if (!supabase) notFound();

  // Published only, scoped to this tenant. Two venues can both own the slug
  // `noche-de-salsa`, which is why the tenant is part of the lookup and not an
  // afterthought — and why this path is agency/hub only in the allow-list.
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select(
      "id, slug, title, description, doors_offset_minutes, age_gate, refund_cutoff_hours, venue_id, offering_id",
    )
    .eq("tenant_id", scope.tenantId)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (eventErr) {
    logServerError("events.publicDetail", eventErr);
    notFound();
  }
  if (!event) notFound();

  const { data: sessionRows, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, status")
    .eq("event_id", event.id as string)
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true });

  if (sessionErr) {
    logServerError("events.publicDetail/sessions", sessionErr);
    notFound();
  }

  const { data: venueRow, error: venueErr } = event.venue_id
    ? await supabase
        .from("venues")
        .select("timezone, name")
        .eq("id", event.venue_id as string)
        .maybeSingle()
    : { data: null, error: null };

  if (venueErr) logServerError("events.publicDetail/venue", venueErr);

  const { data: agencyRow, error: agencyErr } = await supabase
    .from("agencies")
    .select("timezone")
    .eq("id", scope.tenantId)
    .maybeSingle();

  if (agencyErr) logServerError("events.publicDetail/workspaceTimezone", agencyErr);

  const zone = pickTimezone({
    venue: (venueRow?.timezone as string | null) ?? null,
    workspace: (agencyRow?.timezone as string | null) ?? null,
  }).timezone;

  // Tiers are catalog variants. A variant with no `pool_key` is an ordinary
  // product option rather than a ticket tier.
  const { data: variantRows, error: variantErr } = event.offering_id
    ? await supabase
        .from("talent_offering_variants")
        .select(
          "id, label, amount_cents, pool_key, sales_from, sales_until, min_per_order, max_per_order, is_hidden, admits_per_unit, sort_order",
        )
        .eq("offering_id", event.offering_id as string)
        .order("sort_order", { ascending: true })
    : { data: [] as Array<Record<string, unknown>>, error: null };

  if (variantErr) logServerError("events.publicDetail/tiers", variantErr);

  const nowIso = new Date().toISOString();
  const sessions = sessionRows ?? [];
  const nextAt = (sessions.find((s) => (s.starts_at as string) >= nowIso)?.starts_at as string) ?? null;
  const doors = doorsAt(nextAt ?? "", (event.doors_offset_minutes as number | null) ?? 0);

  const tiers = (variantRows ?? [])
    .filter((v) => typeof v.pool_key === "string" && v.pool_key)
    .map((v) => {
      const tier: Tier = {
        id: v.id as string,
        label: v.label as string,
        poolKey: v.pool_key as string,
        amountCents: (v.amount_cents as number | null) ?? 0,
        salesFrom: (v.sales_from as string | null) ?? null,
        salesUntil: (v.sales_until as string | null) ?? null,
        minPerOrder: (v.min_per_order as number | null) ?? 1,
        maxPerOrder: (v.max_per_order as number | null) ?? null,
        isHidden: Boolean(v.is_hidden),
      };
      return { tier, state: saleState(tier, nowIso) };
    })
    // A hidden tier is sold by link and must never be LISTED. `saleState`
    // returns `hidden` for exactly that, which is why the public page asks it
    // rather than `saleWindowState`.
    .filter((t) => !(t.state.onSale === false && t.state.reason === "hidden"));

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <div className="text-xs uppercase tracking-wide text-black/50">
          {whenLabel(nextAt, zone)}
          {doors ? ` · doors ${whenLabel(doors.toISOString(), zone).split(", ").pop()}` : null}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{event.title as string}</h1>
        {venueRow?.name ? (
          <p className="mt-1 text-sm text-black/60">{venueRow.name as string}</p>
        ) : null}
        {event.age_gate ? (
          <p className="mt-1 text-sm text-black/60">{event.age_gate as number} and over</p>
        ) : null}

        {event.description ? (
          <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed">
            {event.description as string}
          </p>
        ) : null}

        {sessions.length > 1 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Dates</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {sessions.map((s) => (
                <li key={s.id as string} className="text-sm text-black/70">
                  {whenLabel(s.starts_at as string, zone)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Tickets</h2>
          {tiers.length === 0 ? (
            <p className="mt-2 text-sm text-black/60">Not on sale yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {tiers.map(({ tier, state }) => (
                <li
                  key={tier.id}
                  className="flex items-baseline justify-between gap-4 rounded-lg border border-black/10 p-4"
                >
                  <div>
                    <div className="font-medium">{tier.label}</div>
                    {tier.maxPerOrder ? (
                      <div className="text-xs text-black/50">
                        up to {tier.maxPerOrder} per order
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{money(tier.amountCents)}</div>
                    {!state.onSale ? (
                      <div className="text-xs text-black/50">
                        {state.reason === "scheduled" ? "Not yet on sale" : "Sales closed"}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/* No "Get tickets" button until it works. A dead CTA on the page a
              visitor arrives at to buy is worse than an honest price list. */}
          <p className="mt-4 text-sm text-black/60">
            Online booking for this event opens soon. Contact the venue to reserve.
          </p>
        </section>

        {event.refund_cutoff_hours != null ? (
          <p className="mt-8 text-xs text-black/50">
            Refundable up to {event.refund_cutoff_hours as number} hours before the event.
          </p>
        ) : null}
      </main>
      <PublicFooter />
    </>
  );
}
