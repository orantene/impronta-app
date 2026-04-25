import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AdminEmptyState — shared empty-state card for list pages (audit 2 #4).
 *
 * Used when a queue / table has no rows — either because filters are too tight
 * or because the workspace is genuinely empty. Renders an icon, headline,
 * subcopy, and an optional CTA so the surface never looks broken.
 *
 *   <AdminEmptyState icon={Inbox} title="No requests yet"
 *     description="When a client submits an inquiry it lands here."
 *     action={<Button asChild><Link href="/admin/inquiries/new">New request</Link></Button>}
 *   />
 */
export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[rgba(24,24,27,0.18)] bg-white px-6 py-12 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: "rgba(24, 24, 27, 0.04)",
          color: "#18181b",
          boxShadow: "inset 0 0 0 1px rgba(24, 24, 27, 0.08)",
        }}
      >
        <Icon className="size-5" />
      </span>
      <div className="max-w-sm space-y-1">
        <h3 className="font-display text-[15px] font-semibold tracking-[-0.005em] text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
