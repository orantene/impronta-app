"use client";

import { ChevronRight, Lock } from "lucide-react";

import { PLAN_BADGE_COLOR, type Capability } from "./capability-catalog";
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
  const accent = PLAN_BADGE_COLOR[capability.tier];

  const lockedTint: Record<string, { bg: string; border: string }> = {
    studio: {
      bg: "linear-gradient(180deg, rgba(58,123,255,0.06), white 70%)",
      border: "rgba(58,123,255,0.25)",
    },
    agency: {
      bg: "linear-gradient(180deg, rgba(139,109,31,0.08), white 70%)",
      border: "rgba(139,109,31,0.28)",
    },
    network: {
      bg: "linear-gradient(180deg, rgba(20,107,58,0.06), white 70%)",
      border: "rgba(20,107,58,0.25)",
    },
    free: { bg: "white", border: "rgba(24,24,27,0.1)" },
  };
  const tint = locked ? lockedTint[capability.tier] : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        "group relative block w-full rounded-2xl border p-4 text-left shadow-sm transition-[border-color,box-shadow,transform] duration-200",
        "hover:-translate-y-px hover:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.28)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        locked
          ? "hover:border-foreground/30"
          : "border-border/60 bg-card/50 hover:border-[var(--impronta-gold)]/40 hover:bg-muted/30",
      )}
      style={
        tint
          ? { background: tint.bg, borderColor: tint.border }
          : undefined
      }
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
                className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] shadow-[inset_0_0_0_1px_currentColor]"
                style={{ color: accent.fg }}
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
