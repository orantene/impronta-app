"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

type AdminFilterBarProps = {
  title?: string;
  description?: string;
  /** Shown in the mobile trigger and next to the section title when &gt; 0. */
  activeCount?: number;
  className?: string;
  cardClassName?: string;
  /** Filter controls (usually a `<form>`). */
  children: React.ReactNode;
};

/**
 * Wraps filter forms in a section card. On small screens the body collapses by default
 * to reduce noise; desktop always shows filters.
 */
export function AdminFilterBar({
  title = "Search & filters",
  description,
  activeCount = 0,
  className,
  cardClassName,
  children,
}: AdminFilterBarProps) {
  const [open, setOpen] = useState(false);
  const count = Math.max(0, Math.floor(activeCount));

  return (
    <DashboardSectionCard
      className={cn(cardClassName, className)}
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className={ADMIN_SECTION_TITLE_CLASS}>{title}</span>
          {count > 0 ? (
            <Badge variant="secondary" className="rounded-full border border-border/50 font-mono text-[11px]">
              {count} active
            </Badge>
          ) : null}
        </span>
      }
      description={description}
      right={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-10 gap-1.5 rounded-xl border-border/60 sm:h-9 md:hidden",
            "min-h-[44px] sm:min-h-0",
          )}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"} filters
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </Button>
      }
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      <div className={cn(open ? "block" : "hidden", "md:block")}>{children}</div>
    </DashboardSectionCard>
  );
}
