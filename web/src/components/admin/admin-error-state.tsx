import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { ADMIN_ERROR_CARD } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

/**
 * Consistent error surface for admin pages — matches {@link DashboardEmptyState} rhythm
 * but for failures and validation messages.
 */
export function AdminErrorState({
  title,
  description,
  children,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** e.g. retry button */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(ADMIN_ERROR_CARD, "flex flex-col gap-3", className)}
      role="alert"
    >
      <div className="flex gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium leading-snug text-destructive">{title}</p>
          {description ? (
            <div className="text-[13px] leading-relaxed text-destructive/90">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {children}
      {actions ? (
        <div className="flex flex-wrap gap-2 pt-0.5 [&:empty]:hidden">{actions}</div>
      ) : null}
    </div>
  );
}
