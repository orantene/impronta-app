"use client";

// Events & Ticketing — the Events tab. PLACEHOLDER page-module, owned by the
// Events & Ticketing Manager per docs/plans/events-rail-slot-contract.md. This
// exists so /admin/events does not 404 on a direct URL the moment the segment is
// registered, and so the PageRouter case renders content rather than a blank body.
//
// The Manager REPLACES the body below with the real Events surface from
// lib/events/* (on main / pushed): the event list, then seven tabs on a selected
// event — Details, Sessions, Tickets, Seating, Lineup, Sales, Door — reading
// summariseEvent / saleState / staffLineup / doorCounts. Two of those tabs are
// empty by design and must say so rather than look broken: Seating (no seat maps
// until Spaces S4/S5) and Door (needs the public path, gated on the
// surface-allow-list decomposition).
//
// Rendered inside the shell's own <main> (WorkspaceShell wraps PageRouter), so
// this returns a fragment. Token classes only — inline styles are frozen under
// components/admin/shell.
//
// NOT here (deferred with the door): the rail entry (Sell and grow, after menu),
// its SIDEBAR_ICON entry, and the "events switched on" visibility gate. That gate
// must not become a blind fetch in admin/layout.tsx (the hot path); it is handed
// to the manager who owns the events-enabled flag.

import { PageHeader } from "./pages-shared";

export function EventsPage() {
  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Ticketed events: tiers, lineup, sales, and the door."
      />
      <div className="max-w-[560px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px]">
        <div className="text-[15px] font-semibold text-admin-ink">No events yet</div>
        <p className="mt-[8px] text-[13.5px] leading-[1.5] text-admin-ink-muted">
          Your ticketed events render here. This tab is registered and reachable;
          the events surface (the list and its Details, Sessions, Tickets, Seating,
          Lineup, Sales and Door tabs) is wired in next from the events engine
          already on main.
        </p>
      </div>
    </>
  );
}
