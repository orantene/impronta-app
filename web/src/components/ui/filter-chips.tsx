"use client";

import type { AriaRole, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type FilterChipProps = {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  /** Trailing control (e.g. dismiss icon) — still one chip surface for a11y. */
  children?: ReactNode;
  title?: string;
  role?: AriaRole;
  "aria-selected"?: boolean;
};

/** Directory / taxonomy filter chips — flat, minimal (not AI suggestion pills). */
export function FilterChip({
  label,
  selected,
  onClick,
  className,
  disabled,
  children,
  title,
  role,
  "aria-selected": ariaSelected,
}: FilterChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      role={role}
      aria-selected={ariaSelected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        selected
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border/80 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <span className="min-w-0">{label}</span>
      {children}
    </button>
  );
}

export function FilterChips({
  className,
  children,
  role,
  "aria-label": ariaLabel,
}: {
  className?: string;
  children: ReactNode;
  role?: AriaRole;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role={role ?? "list"} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
