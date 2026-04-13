"use client";

import { DashboardSegmentedNav } from "@/components/dashboard/dashboard-segmented-nav";

export function AdminMediaTabNav({ mode }: { mode: "pending" | "library" }) {
  return (
    <DashboardSegmentedNav
      ariaLabel="Media workspace"
      items={[
        { href: "/admin/media", label: "Pending Approvals", active: mode === "pending" },
        { href: "/admin/media?tab=library", label: "Media Library", active: mode === "library" },
      ]}
    />
  );
}
