"use client";

import { AdminQuickNav } from "@/app/(dashboard)/admin/admin-quick-nav";
import { AdminCommandPalette } from "@/components/admin/admin-command-palette";
import { WorkspaceStickyShell } from "@/components/dashboard/workspace-sticky-shell";
import {
  AdminPulseStrip,
  type AdminPulseCounts,
} from "@/components/admin/admin-pulse-strip";

export function AdminWorkspaceShell({
  children,
  pulseCounts,
}: {
  children: React.ReactNode;
  pulseCounts: AdminPulseCounts | null;
}) {
  return (
    <div className="space-y-4">
      <WorkspaceStickyShell density="compact">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="order-1 shrink-0 lg:order-2 lg:max-w-[240px] lg:flex-shrink-0">
            <AdminCommandPalette />
          </div>
          <div className="order-2 flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 lg:order-1">
            <AdminPulseStrip counts={pulseCounts} />
            <div className="min-w-0 sm:flex-1">
              <AdminQuickNav />
            </div>
          </div>
        </div>
      </WorkspaceStickyShell>

      <div className="min-h-[12rem]">{children}</div>
    </div>
  );
}
