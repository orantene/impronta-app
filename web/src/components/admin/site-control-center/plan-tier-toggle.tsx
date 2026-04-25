"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { PLAN_COLOR, PLAN_LABEL, PLAN_ORDER, type Plan } from "./capability-catalog";
import { cn } from "@/lib/utils";

/**
 * Sticky pill toggle that re-renders the catalog with the chosen plan as
 * "active". Implemented with <Link href="?plan=..."> so the full page is
 * a server component — no client state needed beyond URL.
 *
 * The active pill takes the tier color so the mental model is reinforced
 * every time you switch.
 */
export function PlanTierToggle({ activePlan }: { activePlan: Plan }) {
  const searchParams = useSearchParams();

  const buildHref = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    return (plan: Plan) => {
      params.set("plan", plan);
      return `?${params.toString()}`;
    };
  }, [searchParams]);

  return (
    <div
      role="tablist"
      aria-label="View plan"
      className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
    >
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        View plan
      </span>
      {PLAN_ORDER.map((plan) => {
        const isActive = plan === activePlan;
        const color = PLAN_COLOR[plan];
        return (
          <Link
            key={plan}
            href={buildHref(plan)}
            role="tab"
            aria-selected={isActive}
            replace
            scroll={false}
            className={cn(
              "rounded-full border px-3 py-1 text-[11.5px] font-semibold tracking-tight transition-[background-color,border-color,color] duration-150",
              isActive
                ? "border-transparent shadow-sm"
                : "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
            style={
              isActive
                ? { backgroundColor: color.bg, color: color.fg, borderColor: color.bg }
                : undefined
            }
          >
            {PLAN_LABEL[plan]}
          </Link>
        );
      })}
      <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
        Showing what's unlocked at this tier.
      </span>
    </div>
  );
}
