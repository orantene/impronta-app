"use client";

import { AdminPageTabs } from "@/components/admin/admin-page-tabs";

export function AdminMediaTabNav({ mode }: { mode: "pending" | "library" }) {
  return (
    <AdminPageTabs
      ariaLabel="Media workspace"
      items={[
        { href: "/admin/media", label: "Pending Approvals", active: mode === "pending" },
        { href: "/admin/media?tab=library", label: "Media Library", active: mode === "library" },
      ]}
    />
  );
}
