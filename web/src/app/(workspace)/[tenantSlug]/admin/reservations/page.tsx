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
import { headers } from "next/headers";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import { floorBoardCopy } from "@/components/admin/floor/floor-copy";
import { loadFloorBoardData } from "../pos/floor-screen";
import { loadHostStand } from "./host-stand-data";
import { todayIn } from "./floor-book";
import { LiveFloorClient } from "./LiveFloorClient";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[1180px] px-7 py-8 text-admin-ink">
      <h1 className="m-0 text-[26px] font-semibold">{title}</h1>
      {children}
    </main>
  );
}

function Card({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="mt-6 max-w-[560px] rounded-xl border border-admin-border bg-admin-surface-alt px-6 py-7">
      <div className="text-[15px] font-semibold text-admin-ink">{heading}</div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-admin-ink-muted">{body}</p>
    </section>
  );
}

/**
 * The Live Floor (`LiveFloor.dc.html`). A venue with no service configured
 * gets the three honest cards it always had (no venue, not configured, a
 * read that failed): a failed read is NOT an empty book, and neither is a
 * floor with nothing on it.
 */
export default async function ReservationsPage({ params }: { params: PageParams }) {
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

  // The venue's own today is only known once the venue is read, so the
  // configuration probe runs on the platform's date and the board on the venue's.
  const probe = await loadHostStand(scope.tenantId, todayIn("UTC", now), now);
  if (probe.kind === "no_venue") {
    return (
      <Shell title={title}>
        <Card heading={tr("dashboard.reservationsDesk.noVenueHeading")} body={tr("dashboard.reservationsDesk.noVenueBody")} />
      </Shell>
    );
  }
  if (probe.kind === "not_configured") {
    return (
      <Shell title={title}>
        <Card
          heading={tr("dashboard.reservationsDesk.notConfiguredHeading")}
          body={interpolate(tr("dashboard.reservationsDesk.notConfiguredBody"), { venue: probe.venueName })}
        />
      </Shell>
    );
  }
  if (probe.kind === "unavailable") {
    return (
      <Shell title={title}>
        <Card heading={tr("dashboard.reservationsDesk.unavailableHeading")} body={tr("dashboard.reservationsDesk.unavailableBody")} />
      </Shell>
    );
  }

  const admin = createServiceRoleClient();
  const loaded = admin ? await loadFloorBoardData(admin, scope.tenantId, locale) : { ok: false as const };
  if (!loaded.ok) {
    return (
      <Shell title={title}>
        <Card heading={tr("dashboard.reservationsDesk.unavailableHeading")} body={tr("dashboard.reservationsDesk.unavailableBody")} />
      </Shell>
    );
  }

  const copy = floorBoardCopy(tr);
  const service = loaded.data.service
    ? interpolate(copy.service, {
        label: loaded.data.service.label,
        start: venueHhmm(loaded.data.service.startsAtIso, loaded.data.timeZone, locale),
        end: venueHhmm(loaded.data.service.endsAtIso, loaded.data.timeZone, locale),
      })
    : copy.serviceNone;
  // The browser-facing path of THIS request, so the check opens on the host
  // shape it arrived on (`x-impronta-original-pathname`, set by middleware).
  const hdrs = await headers();
  const original = (hdrs.get("x-impronta-original-pathname") ?? `/${tenantSlug}/admin/reservations`).split("?")[0] ?? "";
  const posPath = original.replace(/\/reservations$/, "/pos");

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col">
      <LiveFloorClient
        data={loaded.data}
        copy={copy}
        title={title}
        subtitle={`${probe.data.venueName} · ${service}`}
        posPath={posPath}
      />
    </main>
  );
}
