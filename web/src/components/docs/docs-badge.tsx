import { cn } from "@/lib/utils";

const VARIANTS = {
  default: "border-border/60 bg-muted/25 text-muted-foreground",
  success: "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  gold: "border-[var(--impronta-gold-border)]/50 bg-[var(--impronta-gold)]/10 text-foreground",
  muted: "border-transparent bg-muted/40 text-muted-foreground",
} as const;

export function DocsBadge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
