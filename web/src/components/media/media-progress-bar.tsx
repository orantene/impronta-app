import { cn } from "@/lib/utils";

export function MediaProgressBar({
  value,
  trackClassName,
  barClassName,
}: {
  value: number;
  trackClassName?: string;
  barClassName?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", trackClassName)}>
      <div
        className={cn(
          "h-full bg-[var(--impronta-gold)] transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          barClassName,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
