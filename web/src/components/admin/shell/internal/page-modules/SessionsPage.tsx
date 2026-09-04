"use client";

// Sessions — the Schedule tab. PLACEHOLDER page-module, owned by the Sessions &
// Classes Manager per docs/plans/sessions-rail-slot-contract.md. This exists so
// the "sessions" rail entry renders something (not a blank body) and the segment
// does not 404 on a direct URL the moment it is registered.
//
// The Manager REPLACES the body below with the real Schedule surface from
// lib/sessions/* (already on main): the series list, the per-series occurrence
// list (read from `sessions` + `capacity_remaining_public`), the series editor
// whose save calls `planSeriesEdit` and shows the plan before committing, and
// the refusal panel computed live from `decideMaterialisation` — the screen
// that gives an operator somewhere to look when a class silently did not appear.
//
// Rendered inside the shell's own <main> (WorkspaceShell wraps PageRouter), so
// this returns a fragment, not another <main>. Token classes only — inline
// styles are frozen under components/admin/shell.

import { PageHeader } from "./pages-shared";

export function SessionsPage() {
  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Series and their occurrences, with the series editor."
      />
      <div className="max-w-[560px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px]">
        <div className="text-[15px] font-semibold text-admin-ink">No series yet</div>
        <p className="mt-[8px] text-[13.5px] leading-[1.5] text-admin-ink-muted">
          Your recurring sessions and classes render here. This tab is registered
          and reachable; the schedule surface (series, occurrences, the editor, and
          the refusals panel) is wired in next from the sessions engine already on main.
        </p>
      </div>
    </>
  );
}
