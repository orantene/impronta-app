"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

/**
 * Section card whose body is collapsed by default on small screens (expanded on md+).
 */
export function AdminCollapsibleSection({
  title,
  description,
  children,
  className,
  cardClassName,
  toggleLabelShow = "Show",
  toggleLabelHide = "Hide",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  cardClassName?: string;
  toggleLabelShow?: string;
  toggleLabelHide?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DashboardSectionCard
      className={cn(cardClassName, className)}
      title={title}
      description={description}
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
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
          {open ? toggleLabelHide : toggleLabelShow}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </Button>
      }
    >
      <div className={cn(open ? "block" : "hidden", "md:block")}>{children}</div>
    </DashboardSectionCard>
  );
}
