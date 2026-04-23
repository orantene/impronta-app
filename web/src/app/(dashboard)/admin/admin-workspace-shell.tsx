"use client";

import { usePathname } from "next/navigation";
import type { AdminPulseCounts } from "@/components/admin/admin-pulse-strip";
import { AdminTopBar } from "@/components/admin/admin-top-bar";
import { ADMIN_PAGE_TRANSITION } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

/**
 * Phase 15 / Admin shell v2 — workspace frame.
 *
 * Previously an empty wrapper after the pulse strip was removed. Now hosts
 * the contextual top bar (breadcrumb + publish pill + public-site toggle
 * + Cmd+K hint) that frames every admin page without touching the larger
 * prototype shell.
 *
 * Also applies a 200ms fade-in on route changes so the product feels as
 * responsive as the builder underneath it. Keyed off pathname so React
 * re-mounts the wrapper on segment change.
 *
 * Pulse counts still arrive here for future use (sidebar badges, inline
 * attention). Not yet consumed — the top bar is presentational; server
 * data plugs in later.
 */
export function AdminWorkspaceShell({
  children,
  pulseCounts: _pulseCounts,
}: {
  children: React.ReactNode;
  pulseCounts: AdminPulseCounts | null;
}) {
  const pathname = usePathname() ?? "/admin";
  return (
    <div className="flex min-h-[12rem] flex-col">
      <AdminTopBar />
      <div key={pathname} className={cn("flex-1", ADMIN_PAGE_TRANSITION)}>
        {children}
      </div>
    </div>
  );
}
