import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Consistent max width and vertical rhythm for talent inner pages (matches My Profile). */
export function TalentDashboardPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-2xl space-y-7 xl:max-w-5xl 2xl:max-w-6xl xl:space-y-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TalentPageHeader({
  icon: Icon,
  title,
  description,
  right,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="flex min-w-0 gap-3 lg:gap-4">
        {Icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/15 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/20 lg:h-14 lg:w-14 lg:rounded-3xl">
            <Icon className="size-5 lg:size-6" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="font-display text-base font-semibold tracking-tight text-foreground lg:text-xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground lg:mt-2 lg:text-base lg:leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      {right ? <div className="shrink-0 sm:pt-1">{right}</div> : null}
    </div>
  );
}

/** Uppercase section label with gold icon chip — pair with cards or grids below. */
export function TalentSectionLabel({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-0.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--impronta-gold)]/14 text-[var(--impronta-gold)] shadow-sm ring-1 ring-[var(--impronta-gold)]/22">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground lg:text-xs">
        {children}
      </span>
    </div>
  );
}

export function TalentFlashBanner({
  variant = "info",
  children,
}: {
  variant?: "success" | "info" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm leading-relaxed lg:px-5 lg:py-3.5 lg:text-[15px]",
        variant === "success" &&
          "border-emerald-500/35 bg-emerald-500/[0.09] text-emerald-950 dark:text-emerald-50",
        variant === "info" && "border-primary/40 bg-primary/10 text-foreground",
        variant === "warning" &&
          "border-amber-500/35 bg-amber-500/[0.09] text-amber-950 dark:text-amber-50",
      )}
    >
      {children}
    </div>
  );
}

/** Large ring for hero cards (matches agency / talent “status at a glance” language). */
export function TalentHeroCompletionRing({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div
      className="relative flex size-[4.75rem] shrink-0 items-center justify-center"
      role="img"
      aria-label={`Profile completion ${pct} percent`}
    >
      <svg className="size-full -rotate-90 drop-shadow-[0_2px_8px_rgba(201,162,39,0.15)]" viewBox="0 0 88 88" aria-hidden>
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          className="stroke-muted/30"
          strokeWidth="7"
        />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          className="stroke-[var(--impronta-gold)]/90"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute font-display text-base font-semibold tabular-nums tracking-tight text-foreground">
        {pct}
      </span>
    </div>
  );
}

export function TalentInlineProgress({
  label,
  value,
  max = 100,
  className,
}: {
  label: string;
  value: number;
  max?: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/45 bg-gradient-to-br from-muted/40 to-muted/20 px-4 py-3.5 shadow-sm lg:px-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground lg:text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{pct}%</span>
      </div>
      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted/70"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-[var(--impronta-gold)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
