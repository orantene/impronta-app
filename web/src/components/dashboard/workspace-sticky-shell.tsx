import type { ReactNode } from "react";
import { getDashboardStickyShellClass } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

/**
 * Sticky top strip shared by admin / talent / client dashboards.
 * Prefer this over duplicating `DASHBOARD_STICKY_SHELL*` strings in route shells.
 */
export function WorkspaceStickyShell({
  density = "default",
  className,
  children,
}: {
  density?: "default" | "compact";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(getDashboardStickyShellClass({ density }), className)}>
      {children}
    </div>
  );
}
