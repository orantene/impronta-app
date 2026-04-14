import { cn } from "@/lib/utils";

const VARIANTS = {
  internal: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  ga4: "border-sky-500/35 bg-sky-500/10 text-sky-100",
  gsc: "border-violet-500/35 bg-violet-500/10 text-violet-100",
  realtime: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  modeled: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
} as const;

export type AnalyticsHonestyVariant = keyof typeof VARIANTS;

export function AnalyticsHonestyLabel({
  variant,
  children,
  className,
}: {
  variant: AnalyticsHonestyVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
