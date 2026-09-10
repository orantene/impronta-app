"use client";

/**
 * PosFrame — the point of sale shell: a rail down one side plus a content
 * slot. Pure presentation; the rail's rows come from `POS_MODE_META[mode]
 * .destinations` (`lib/pos/modes.ts`), never a list this file keeps of its
 * own, so a mode gaining or losing a screen changes the rail by itself.
 *
 * The rail here is the POS's OWN internal rail — "sell", "orders", "shifts"
 * for `counter` mode — not the workspace sidebar (`lib/workspace/
 * destinations.ts`), which never shows a `pos` row at all: the point of sale
 * replaces the whole admin chrome (see that module's `DestinationChrome`).
 * The switch that enters the POS lives in the top bar and is out of scope
 * here (owned by another task).
 */

import type { ReactNode } from "react";
import { POS_MODE_META, type PosMode } from "@/lib/pos/modes";
import { cn } from "@/lib/utils";

export type PosFrameProps = {
  readonly mode: PosMode;
  /**
   * The rail's own name, translated — this labels the `<nav>` region itself,
   * never looked up from `destinationLabels` (that map is keyed by
   * destination id, e.g. "sell"/"orders"/"shifts", and a mode id such as
   * "counter" is never one of those keys, so a lookup there can never hit).
   * Callers build this with `railNavLabel` (`pos-copy.ts`), which reads it
   * from the message catalogue in the request's own language rather than
   * falling back to `POS_MODE_META[mode].label`, which is English only.
   */
  readonly navLabel: string;
  readonly activeDestination: string;
  readonly onSelectDestination: (destinationId: string) => void;
  /** English fallback per destination id; pass a translated map to localize. */
  readonly destinationLabels: Readonly<Record<string, string>>;
  readonly children: ReactNode;
  readonly className?: string;
};

export function PosFrame({
  mode,
  navLabel,
  activeDestination,
  onSelectDestination,
  destinationLabels,
  children,
  className,
}: PosFrameProps) {
  const meta = POS_MODE_META[mode];
  const destinations = meta.destinations;

  return (
    <div className={cn("flex h-full min-h-[560px] w-full overflow-hidden rounded-2xl border border-border bg-background", className)}>
      <nav
        aria-label={navLabel}
        className="flex w-[200px] shrink-0 flex-col gap-1 border-r border-border bg-card p-3"
      >
        {destinations.map((destinationId) => {
          const active = destinationId === activeDestination;
          return (
            <button
              key={destinationId}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectDestination(destinationId)}
              className={cn(
                "flex h-12 items-center rounded-lg px-3 text-left text-sm font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-accent",
              )}
            >
              {destinationLabels[destinationId] ?? destinationId}
            </button>
          );
        })}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
