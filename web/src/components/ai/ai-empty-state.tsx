"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
};

/** Minimal placeholder when AI is off, idle, or unavailable (Phase 8.8 shell). */
export function AIEmptyState({
  title = "AI assistant",
  description = "Suggestions will appear here when available.",
  className,
  children,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">{description}</p>
      {children}
    </div>
  );
}
