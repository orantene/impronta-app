import { cn } from "@/lib/utils";

export function DashboardPageHeader({
  title,
  eyebrow,
  description,
  right,
  below,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions/CTAs. */
  right?: React.ReactNode;
  /** Optional content rendered below title/description (e.g. badges, status strip). */
  below?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between", className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-lg font-medium tracking-wide text-foreground sm:text-xl">
            {title}
          </h1>
        </div>
        {description ? (
          <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}
        {below ? <div className="pt-1">{below}</div> : null}
      </div>

      {right ? (
        <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:flex-col lg:items-end">
          {right}
        </div>
      ) : null}
    </div>
  );
}

