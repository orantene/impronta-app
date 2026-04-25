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
        "group relative block min-h-[66px] w-full rounded-xl border px-3.5 py-3 text-left transition-[border-color,box-shadow,transform,background-color] duration-150",
        "hover:-translate-y-px hover:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.28)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        locked
          ? "hover:border-foreground/30"
          : "border-[rgba(24,24,27,0.1)] bg-white hover:border-[rgba(24,24,27,0.32)]",
      )}
      style={
        tint
          ? { background: tint.bg, borderColor: tint.border }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px]"
          style={
            capability.iconAccent
              ? {
                  backgroundColor: "rgba(24, 24, 27, 0.06)",
                  color: "#18181b",
                  boxShadow: "inset 0 0 0 1px rgba(24, 24, 27, 0.18)",
                }
              : {
                  backgroundColor: "#f5f4ef",
                  color: "#18181b",
                  boxShadow: "inset 0 0 0 1px rgba(24, 24, 27, 0.1)",
                }
          }
        >
          <Icon className="size-[15px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "truncate text-[13.5px] font-semibold tracking-[-0.005em]",
              locked ? "text-foreground/80" : "text-foreground",
            )}
          >
            {capability.label}
          </h3>
          <p
            className={cn(
              "mt-0.5 truncate text-[11.5px] leading-[1.3]",
              locked ? "italic text-muted-foreground" : "text-muted-foreground",
            )}
          >
            {locked ? capability.lockedCopy : capability.stat}
          </p>
        </div>
        {locked ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-[7px] py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] shadow-[inset_0_0_0_1px_currentColor]"
            style={{ color: accent.fg }}
          >
            <Lock className="size-2" aria-hidden />
            {capability.tier}
          </span>
        ) : (
          <ChevronRight
            className="size-3.5 shrink-0 self-center text-muted-foreground/70 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:text-foreground group-hover:opacity-100"
            aria-hidden
          />
        )}
      </div>
    </button>
  );
}
