import { cn } from "@/lib/utils";

export function DashboardEmptyState({
  title,
  description,
  icon,
  actions,
  className,
  accent,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Subtle gold hint to match client portal chrome. */
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/5 px-6 py-14 text-center",
        accent
          ? "border-[var(--impronta-gold-border)]/35 bg-[var(--impronta-gold)]/[0.03]"
          : "border-border/70",
        className,
      )}
      role="status"
    >
      {icon ? (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/15 text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

