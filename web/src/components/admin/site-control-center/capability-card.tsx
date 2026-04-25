import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";

import { PLAN_COLOR, type Capability, type Plan } from "./capability-catalog";
import { cn } from "@/lib/utils";

/**
 * One capability tile. Two states:
 *   unlocked → behaves like AdminSurfaceCard variant=object, navigates to href
 *   locked   → static card, italic conversion-hook copy, lock chip, no href
 *
 * We don't reuse AdminSurfaceCard directly because the locked variant needs
 * tier-specific accent text — pushing that into the shared primitive would
 * leak tier knowledge upstream. Cheap to keep separate.
 */
export function CapabilityCard({
  capability,
  locked,
  activePlan: _activePlan,
}: {
  capability: Capability;
  locked: boolean;
  /** Reserved for future analytics / hover hints. */
  activePlan: Plan;
}) {
  const Icon = capability.icon;
  const accentColor = PLAN_COLOR[capability.tier];

  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
            locked
              ? "border-border/50 bg-muted/40 text-muted-foreground"
              : capability.iconAccent
                ? "border-[var(--impronta-gold)]/30 bg-[var(--impronta-gold)]/12 text-[var(--impronta-gold)]"
                : "border-border/60 bg-background text-foreground",
          )}
        >
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                "truncate font-display text-[15px] font-semibold tracking-tight",
                locked ? "text-foreground/80" : "text-foreground",
              )}
            >
              {capability.label}
            </h3>
            {locked ? (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em]"
                style={{
                  backgroundColor: accentColor.bg,
                  color: accentColor.fg,
                }}
              >
                <Lock className="size-2.5" aria-hidden />
                {capability.tier}
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "mt-0.5 truncate text-[12.5px]",
              locked ? "italic text-muted-foreground" : "text-muted-foreground",
            )}
          >
            {locked ? capability.lockedCopy : capability.stat}
          </p>
        </div>
        {!locked ? (
          <ChevronRight
            className="size-4 shrink-0 self-center text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden
          />
        ) : null}
      </div>
    </>
  );

  const baseClasses =
    "group relative block rounded-2xl border bg-card/50 p-4 shadow-sm transition-[border-color,box-shadow,background-color] duration-200";

  if (locked) {
    return (
      <div
        className={cn(
          baseClasses,
          "border-border/40 bg-muted/[0.18] cursor-default",
        )}
        aria-disabled
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={capability.href}
      className={cn(
        baseClasses,
        "border-border/60 hover:-translate-y-px hover:border-[var(--impronta-gold)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {inner}
    </Link>
  );
}
