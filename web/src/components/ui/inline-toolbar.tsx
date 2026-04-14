"use client";

import { cn } from "@/lib/utils";

type InlineToolbarProps = {
  className?: string;
  children: React.ReactNode;
};

/** Compact actions row for editors (profile, CMS, inquiry). */
export function InlineToolbar({ className, children }: InlineToolbarProps) {
  return (
    <div
      role="toolbar"
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-md border border-border/50 bg-muted/20 p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
