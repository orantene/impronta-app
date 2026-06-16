"use client";

import type { ReactNode } from "react";

/**
 * WS-A A5 — shared editor body for the curated header-widget embeds. These
 * sections wrap a live header widget and carry NO authored content (the widget
 * owns its own data + markup), so the inspector body is a short explanatory note
 * rather than a form. Kept minimal + dependency-free so each section's Editor is
 * a one-line wrapper.
 */
export function HeaderWidgetEditorNote({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-3 text-sm">
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
