import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /**
   * Optional secondary line under description — use for micro-hints like
   * "Tip: Cmd+K to jump anywhere" or "Try clearing filters to see archived rows."
   */
  hint?: string;
  className?: string;
  /** CTAs (buttons or links) — rendered in a centered row below description. */
  children?: ReactNode;
};

/**
 * Phase 15 / Admin shell v2 — premium empty state.
 *
 * Replaces the former flat dashed box with a subtle gold-tint gradient,
 * larger icon chip, tighter type scale, and a dedicated CTA row. Empty
 * states are part of onboarding and trust — this one guides the next
 * right action instead of merely explaining absence.
 *
 * Consumer API unchanged (icon/title/description/children) so existing
 * call-sites pick up the new look without edits.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  hint,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60",
        "bg-gradient-to-br from-[var(--impronta-gold)]/[0.04] via-card/30 to-muted/10",
        "px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "mb-4 flex size-12 items-center justify-center rounded-2xl",
            "bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]",
          )}
        >
          <Icon className="size-6" strokeWidth={1.5} aria-hidden />
        </div>
      ) : null}
      <p className="text-base font-semibold tracking-tight text-foreground">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-1.5 max-w-md text-xs leading-snug text-muted-foreground/80">
          {hint}
        </p>
      ) : null}
      {children ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
