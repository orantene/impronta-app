import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";

/**
 * AdminListPage — shared shell for index/list routes (audit Finding #3).
 *
 * Standardizes the visual rhythm: header → optional banners → tabs → filters →
 * content. Every list surface (Requests, Bookings, Talent, Clients, Locations…)
 * should render through this so spacing, max-width, and chrome stay
 * predictable. Detail pages keep using AdminPageHeader directly.
 *
 * Slots are rendered in order; pass `null` for any you don't need. The body
 * slot is required and holds the queue / table / grid.
 */
export function AdminListPage({
  eyebrow,
  title,
  description,
  right,
  banners,
  tabs,
  filters,
  children,
  className,
  maxWidthClassName = "mx-auto max-w-6xl",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  /** Scope-banner area (e.g. "Scoped to client X · Clear scope"). */
  banners?: ReactNode;
  /** AdminStatusTabs or any tab strip. */
  tabs?: ReactNode;
  /** AdminFilterBar or filter form. */
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Override the centered max-width wrapper. Pass empty string to disable. */
  maxWidthClassName?: string;
}) {
  return (
    <div className={cn(maxWidthClassName, ADMIN_PAGE_STACK, className)}>
      <AdminPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        right={right}
      />
      {banners}
      {tabs}
      {filters}
      {children}
    </div>
  );
}
