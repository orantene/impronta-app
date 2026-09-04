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
// The Reservations Manager REPLACES the body below with the book UI from
// `lib/reservations/book.ts` (already on main): buildBook() for the ordered
// day, summariseBook() for the four counters (covers + arrived as two numbers,
// arriving-now, running-late, unassigned), commercial state as a separate
// badge, mobile-first. Do NOT add a second check_in / admitted_count
// implementation here (Events & Ticketing owns that RPC) — see the contract.
//
// STILL A FOLLOW-UP (not in this file): the rail entry under Operate and its
// visibility gate on `venue_service_rules.is_active`. That needs a new
// per-venue flag plumbed through admin/layout.tsx -> initialBridgeData ->
// buildSidebarGroups, which is a data-fetch on the admin hot path that must be
// verified at runtime before it ships. Until then reservations is reachable by
// direct URL (unblocking build + QA) but is not advertised in the nav.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border: "rgba(24,24,27,0.08)",
  surface: "rgba(11,11,13,0.02)",
} as const;

export default async function ReservationsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  // Same guard as the Orders desk: view_dashboard, not manage_billing. The host
  // stand is front-of-house, exactly the staff owner-class gating would lock out.
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto", color: C.ink }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>Reservations</h1>
      <p style={{ color: C.inkMuted, marginTop: 6, marginBottom: 24 }}>
        The host stand for today&apos;s book, arrivals, and who is still unseated.
      </p>
      <section
        style={{
          border: `1px solid ${C.border}`,
          background: C.surface,
          borderRadius: 12,
          padding: "28px 24px",
          maxWidth: 560,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>No service windows yet</div>
        <p style={{ color: C.inkMuted, fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>
          The reservations book renders here. This slot is registered and reachable;
          the host-stand UI (covers, arrivals, running late, unseated) is wired in
          next from the reservations engine already on main.
        </p>
      </section>
    </main>
  );
}
