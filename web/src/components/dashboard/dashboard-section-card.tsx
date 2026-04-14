import { cn } from "@/lib/utils";

export function DashboardSectionCard({
  title,
  description,
  right,
  children,
  className,
  titleClassName,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Optional title typography override (e.g. talent dashboard cards). */
  titleClassName?: string;
  /** Anchor id for in-page links (e.g. admin settings sections). */
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-2xl border border-border/60 bg-card/40 shadow-sm",
        "transition-[border-color,box-shadow] duration-200",
        "hover:border-[var(--impronta-gold-border)]/50 hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.65)]",
        className,
      )}
    >
      {title || description || right ? (
        <div className="flex flex-col gap-3 border-b border-border/50 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2
                className={cn(
                  "text-sm font-medium tracking-wide text-foreground",
                  titleClassName,
                )}
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

