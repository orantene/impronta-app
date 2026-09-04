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
import { loadHostStand } from "./host-stand-data";
import { HostStandBoard } from "./HostStandBoard";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearch = Promise<{ date?: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border: "rgba(24,24,27,0.08)",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
} as const;

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
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto", color: C.ink }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>{title}</h1>
      {children}
    </main>
  );
}

function Card({ heading, body }: { heading: string; body: string }) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        background: C.surface,
        borderRadius: 12,
        padding: "28px 24px",
        maxWidth: 560,
        marginTop: 24,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600 }}>{heading}</div>
      <p style={{ color: C.inkMuted, fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>{body}</p>
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
      <Shell title="Reservations">
        <Card
          heading="No venue yet"
          body="Reservations belong to a place and run on that place's clock, so there is nothing to show until this workspace has one."
        />
      </Shell>
    );
  }

  if (state.kind === "not_configured") {
    return (
      <Shell title="Reservations">
        <Card
          heading="No service windows yet"
          body={`${state.venueName} is not taking bookings. Switch reservations on in Settings and add a service window, and tonight's book appears here.`}
        />
      </Shell>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <Shell title="Reservations">
        <Card
          heading="We could not load the book"
          body="Nothing has changed and no booking was affected. Try again in a moment."
        />
      </Shell>
    );
  }

  return (
    <Shell title="Reservations">
      <HostStandBoard
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
