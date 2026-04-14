"use client";

import type { AdminPulseCounts } from "@/components/admin/admin-pulse-strip";

/**
 * Pulse counts are still loaded in the admin layout for future use (sidebar badges, etc.).
 * The former sticky strip (search + pulse + quick nav) was removed — search lives in the shell header.
 */
export function AdminWorkspaceShell({
  children,
  pulseCounts: _pulseCounts,
}: {
  children: React.ReactNode;
  pulseCounts: AdminPulseCounts | null;
}) {
  return <div className="min-h-[12rem]">{children}</div>;
}
