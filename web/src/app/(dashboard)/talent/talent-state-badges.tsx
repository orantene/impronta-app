"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function workflowBadgeClass(status: string) {
  switch (status) {
    case "draft":
    case "hidden":
      return "border-amber-400/55 bg-amber-500/[0.08] text-amber-950 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50";
    case "submitted":
    case "under_review":
      return "border-sky-400/40 bg-sky-500/[0.1] text-sky-950 shadow-sm dark:border-sky-500/35 dark:bg-sky-500/12 dark:text-sky-50";
    case "approved":
      return "border-emerald-400/40 bg-emerald-500/[0.1] text-emerald-950 shadow-sm dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-50";
    default:
      return "border-[var(--impronta-gold-border)]/45 bg-[var(--impronta-gold)]/[0.06] text-foreground shadow-sm";
  }
}

export function StateBadges({
  workflow_status,
  visibility,
  showWorkflow = true,
}: {
  workflow_status: string;
  visibility: string;
  /** When false, only visibility is shown (e.g. when workflow is shown elsewhere). */
  showWorkflow?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {showWorkflow ? (
        <Badge
          variant="outline"
          className={cn(
            "font-normal capitalize",
            workflowBadgeClass(workflow_status),
          )}
        >
          {workflow_status.replace(/_/g, " ")}
        </Badge>
      ) : null}
      <Badge
        variant="outline"
        className="border-border/55 bg-muted/25 font-normal capitalize text-foreground/80 shadow-sm dark:text-muted-foreground"
      >
        {visibility}
      </Badge>
    </div>
  );
}
