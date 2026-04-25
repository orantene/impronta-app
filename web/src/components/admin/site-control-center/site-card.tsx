"use client";

import { ChevronRight, Lock } from "lucide-react";

import { PLAN_COLOR, type Capability } from "./capability-catalog";
import { cn } from "@/lib/utils";

/**
 * SiteCard — drawer-opening variant of CapabilityCard. Lives next to the
 * legacy `Link`-based CapabilityCard, used only by SiteShell. Click always
 * fires `onClick` (drawer for unlocked, upgrade modal for locked) — never
 * navigates.
 */
export function SiteCard({
  capability,
  locked,
  onClick,
}: {
  capability: Capability;
  locked: boolean;
  onClick: () => void;
}) {
  const Icon = capability.icon;
  const accent = PLAN_COLOR[capability.tier];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        "group relative block w-full rounded-2xl border bg-card/50 p-4 text-left shadow-sm transition-[border-color,box-shadow,background-color,transform] duration-200",
        "hover:-translate-y-px hover:border-foreground/40 hover:bg-muted/30 hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        locked ? "border-border/40 bg-muted/[0.18]" : "border-border/60",
      )}
    >
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
                style={{ backgroundColor: accent.bg, color: accent.fg }}
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
    </button>
  );
}
