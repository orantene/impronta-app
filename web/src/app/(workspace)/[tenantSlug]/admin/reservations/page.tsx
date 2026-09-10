// Workspace admin — Reservations host stand (R3).
//
// PLACEHOLDER ROUTE, owned by the Reservations Manager per
// docs/plans/reservations-rail-slot-contract.md. This file exists so the
// segment does not 404 on a direct URL the moment it is registered (the
// documented failure that reads as "the feature was never built"). It is a
// canonical server route like `orders` — registered in the WorkspacePage
// union, WORKSPACE_PAGE_SEGMENTS and canonical-routes.ts, with NO SPA
// PageRouter case.
//
// REPLACED with the real book, per that contract. Decisions live in
// `lib/reservations/book.ts` and are tested there; this file renders them and
// `host-stand-data.ts` fetches. No check_in and no admitted_count arithmetic
// here — Events & Ticketing own that RPC, and a second implementation is what
// three managers spent two days consolidating away.
//
// A FAILED READ IS NOT AN EMPTY BOOK. "We could not load it" and "nobody is
// booked tonight" look identical on a screen and mean opposite things to a
// host, so they are different states with different words.
//
// THE RAIL ENTRY is a follow-up and its data is already solved: rather than a
// fetch on the admin hot path, `agencies.takes_reservations` is a trigger-kept
// boolean on the tenant row `loadTenantIdentity` ALREADY selects, so a tenant
// with no venue pays nothing (migration 20261229000386). Reachable by direct
// URL until the nav entry lands.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { listFloor } from "@/lib/visits/floor";
import { loadHostStand } from "./host-stand-data";
import { HostStandBoard, type SeatableTable } from "./HostStandBoard";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearch = Promise<{ date?: string }>;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Today in a zone, as the venue's own calendar date. */
function todayIn(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[1180px] px-7 py-8 text-foreground">
      <h1 className="m-0 text-[26px] font-semibold">{title}</h1>
      {children}
    </main>
  );
}

function Card({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="mt-6 max-w-[560px] rounded-xl border border-border bg-muted/40 px-6 py-7">
      <div className="text-[15px] font-semibold text-foreground">{heading}</div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
    </section>
  );
}

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: PageSearch;
}) {
  const { tenantSlug } = await params;

  // Same guard as the Orders desk: view_dashboard, not manage_billing. The host
  // stand is front-of-house, exactly the staff owner-class gating would lock out.
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const title = tr("dashboard.reservationsDesk.pageTitle");

  const now = new Date();
  const search = searchParams ? await searchParams : {};
  // A malformed ?date is ignored rather than refused: a host who mistypes a URL
  // wants tonight's book, not an error page. The venue's own date is resolved
  // after the load, because until then we do not know its clock.
  const requested = typeof search.date === "string" && YMD.test(search.date) ? search.date : null;

  const probe = await loadHostStand(scope.tenantId, requested ?? todayIn("UTC", now), now);
  const state =
    probe.kind === "ok" && requested === null
      ? await loadHostStand(scope.tenantId, todayIn(probe.data.timeZone, now), now)
      : probe;

  if (state.kind === "no_venue") {
    return (
      <Shell title={title}>
        <Card
          heading={tr("dashboard.reservationsDesk.noVenueHeading")}
          body={tr("dashboard.reservationsDesk.noVenueBody")}
        />
      </Shell>
    );
  }

  if (state.kind === "not_configured") {
    return (
      <Shell title={title}>
        <Card
          heading={tr("dashboard.reservationsDesk.notConfiguredHeading")}
          body={interpolate(tr("dashboard.reservationsDesk.notConfiguredBody"), { venue: state.venueName })}
        />
      </Shell>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <Shell title={title}>
        <Card
          heading={tr("dashboard.reservationsDesk.unavailableHeading")}
          body={tr("dashboard.reservationsDesk.unavailableBody")}
        />
      </Shell>
    );
  }

  // The tables the desk may put a party on, read from the SAME floor the
  // Tables screen renders. A separate query with its own idea of "free" is how
  // two screens end up disagreeing about whether the room is full. A failed
  // read degrades to "no table to seat on", which is honest, rather than
  // hiding the whole book.
  const floorAdmin = createServiceRoleClient();
  const floor = floorAdmin ? await listFloor(floorAdmin, scope.tenantId) : { ok: false as const };
  const seatable: SeatableTable[] = floor.ok
    ? floor.tables
        .filter((t) => t.state !== "occupied")
        .map((t) => ({
          spaceId: t.spaceId,
          label: t.code ?? t.name,
          partyMin: t.partyMin,
          partyMax: t.partyMax,
          held: t.state === "held",
        }))
    : [];

  return (
    <Shell title={title}>
      <HostStandBoard
        locale={locale}
        copy={{
          coversBooked: tr("dashboard.reservationsDesk.coversBooked"),
          arrived: tr("dashboard.reservationsDesk.arrived"),
          arrivingNow: tr("dashboard.reservationsDesk.arrivingNow"),
          runningLate: tr("dashboard.reservationsDesk.runningLate"),
          noTableYet: tr("dashboard.reservationsDesk.noTableYet"),
          empty: tr("dashboard.reservationsDesk.empty"),
          colTime: tr("dashboard.reservationsDesk.colTime"),
          colGuest: tr("dashboard.reservationsDesk.colGuest"),
          colParty: tr("dashboard.reservationsDesk.colParty"),
          colTable: tr("dashboard.reservationsDesk.colTable"),
          walkIn: tr("dashboard.reservationsDesk.walkIn"),
          wasNoShow: tr("dashboard.reservationsDesk.wasNoShow"),
          refunded: tr("dashboard.reservationsDesk.refunded"),
          cancelled: tr("dashboard.reservationsDesk.cancelled"),
          stateBooked: tr("dashboard.reservationsDesk.stateBooked"),
          stateArriving: tr("dashboard.reservationsDesk.stateArriving"),
          stateLate: tr("dashboard.reservationsDesk.stateLate"),
          statePartSeated: tr("dashboard.reservationsDesk.statePartSeated"),
          stateSeated: tr("dashboard.reservationsDesk.stateSeated"),
          stateNoShow: tr("dashboard.reservationsDesk.stateNoShow"),
          stateCompleted: tr("dashboard.reservationsDesk.stateCompleted"),
          seat: tr("dashboard.reservationsDesk.seat"),
          takeWalkIn: tr("dashboard.reservationsDesk.takeWalkIn"),
          takeWalkInHeading: tr("dashboard.reservationsDesk.takeWalkInHeading"),
          walkInNameLabel: tr("dashboard.reservationsDesk.walkInNameLabel"),
          walkInPartyLabel: tr("dashboard.reservationsDesk.walkInPartyLabel"),
          walkInConfirm: tr("dashboard.reservationsDesk.walkInConfirm"),
          seatHeading: tr("dashboard.reservationsDesk.seatHeading"),
          seatCancel: tr("dashboard.reservationsDesk.seatCancel"),
          noSeatableTable: tr("dashboard.reservationsDesk.noSeatableTable"),
          seatedNotMarked: tr("dashboard.reservationsDesk.seatedNotMarked"),
          refusal: {
            not_found: tr("dashboard.reservationsDesk.refusal.notFound"),
            wrong_tenant: tr("dashboard.reservationsDesk.refusal.notFound"),
            already_open: tr("dashboard.reservationsDesk.refusal.alreadyOpen"),
            invalid: tr("dashboard.reservationsDesk.refusal.invalid"),
            party_too_small: tr("dashboard.reservationsDesk.refusal.partyTooSmall"),
            party_too_large: tr("dashboard.reservationsDesk.refusal.partyTooLarge"),
            not_combinable: tr("dashboard.reservationsDesk.refusal.invalid"),
            joined_unavailable: tr("dashboard.reservationsDesk.refusal.alreadyOpen"),
            not_allowed: tr("dashboard.reservationsDesk.refusal.notAllowed"),
            unavailable: tr("dashboard.reservationsDesk.refusal.unavailable"),
            reservation_not_found: tr("dashboard.reservationsDesk.refusal.reservationNotFound"),
            reservation_other_table: tr("dashboard.reservationsDesk.refusal.reservationOtherTable"),
            reservation_not_valid: tr("dashboard.reservationsDesk.refusal.reservationNotValid"),
            reservation_already_seated: tr("dashboard.reservationsDesk.refusal.reservationAlreadySeated"),
            walkins_off: tr("dashboard.reservationsDesk.refusal.walkinsOff"),
            party_below_minimum: tr("dashboard.reservationsDesk.refusal.partyBelowMinimum"),
            party_above_maximum: tr("dashboard.reservationsDesk.refusal.partyAboveMaximum"),
            no_band_fits_this_party: tr("dashboard.reservationsDesk.refusal.noBandFits"),
            sold_out: tr("dashboard.reservationsDesk.refusal.soldOut"),
            capacity_unavailable: tr("dashboard.reservationsDesk.refusal.capacityUnavailable"),
            engine_error: tr("dashboard.reservationsDesk.refusal.engineError"),
            reservations_off: tr("dashboard.reservationsDesk.refusal.reservationsOff"),
          },
        }}
        data={{
          venueName: state.data.venueName,
          timeZone: state.data.timeZone,
          onDate: requested ?? todayIn(state.data.timeZone, now),
          entries: state.data.entries.map((e) => ({
            admissionId: e.admissionId,
            startsAtIso: e.startsAt.toISOString(),
            partySize: e.partySize,
            admittedCount: e.admittedCount,
            state: e.state,
            lateMinutes: e.lateMinutes,
            isRefunded: e.isRefunded,
            isVoid: e.isVoid,
            wasMarkedNoShow: e.wasMarkedNoShow,
            holderName: e.holderName,
            spaceCode: e.spaceCode,
          })),
          seatable,
          summary: state.data.summary,
          windows: state.data.windows.map((w) => ({
            key: w.key,
            startsAtIso: w.startsAt.toISOString(),
            endsAtIso: w.endsAt.toISOString(),
          })),
        }}
      />
    </Shell>
  );
}
