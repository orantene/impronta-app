"use client";

import { ChevronDown, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useOpenDrill } from "./workspace-v3-drill-sheet";
import type { DrillKey } from "./workspace-v3-drill-types";

/**
 * Admin Workspace V3 — rail panel (collapsible card).
 *
 * Spec §5.2: "Each panel is a collapsible card. Panels expand inline."
 * Roadmap M3.5: "Each panel is a `<Collapsible>` with per-user persistent
 * open/closed state. ... Empty content — wiring in M4."
 *
 * Implementation notes (deliberate scope):
 *   • Persistence is localStorage-keyed per (user × inquiry × panelKey).
 *     This is a UI preference, not engine state — no DB schema needed.
 *   • SSR-safe: render with `defaultOpen` until the effect restores a
 *     previously-persisted value. No flash of wrong state because the stored
 *     value only toggles after mount and we animate from `defaultOpen`.
 *   • Accessible: native `<button>` with `aria-expanded`; chevron rotates.
 *   • No animation beyond CSS rotate + conditional render. M4+ may polish.
 *
 * This component renders only the shell. Callers pass `children` for the
 * real panel content; in M3, children is a single empty-state line
 * ("Wiring in M4.x"). That is **not** fake data — it is a truthful empty
 * state that declares the panel's future scope.
 */

const LS_PREFIX = "impronta.workspace_v3.rail";

function storageKey(userId: string, inquiryId: string, panelKey: string): string {
  return `${LS_PREFIX}.${userId}.${inquiryId}.${panelKey}`;
}

export function WorkspaceV3RailPanel({
  userId,
  inquiryId,
  panelKey,
  title,
  subtitle,
  defaultOpen = true,
  children,
  drillKey,
}: {
  userId: string;
  inquiryId: string;
  /**
   * Stable panel identifier. MUST match the section ordering in §5.2 so
   * persisted user preferences remain correct as new panels are added.
   */
  panelKey:
    | "summary"
    | "requirement_groups"
    | "offers_approvals"
    | "coordinators"
    | "booking"
    | "needs_attention"
    | "recent_activity";
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /**
   * When set, renders an inline "Expand" affordance that opens the
   * corresponding drill-down sheet via `?drill=<drillKey>`. Panels without
   * drill content (e.g. Summary, Needs Attention) omit this.
   */
  drillKey?: DrillKey;
}) {
  const openDrill = useOpenDrill();
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Restore persisted open/closed on mount. We only write after the user
  // toggles — this avoids overwriting other tabs' preferences on first load.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(userId, inquiryId, panelKey));
      if (raw === "1") setOpen(true);
      else if (raw === "0") setOpen(false);
    } catch {
      // ignore — storage disabled / quota / private mode
    }
    setHydrated(true);
  }, [userId, inquiryId, panelKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (hydrated) {
        try {
          window.localStorage.setItem(storageKey(userId, inquiryId, panelKey), next ? "1" : "0");
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const bodyId = `wv3-panel-${panelKey}`;

  return (
    <section className="rounded-xl border border-border/40 bg-background/60">
      <div className="flex items-stretch gap-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-foreground/5",
            drillKey ? "rounded-r-none" : undefined,
          )}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{title}</div>
            {subtitle ? (
              <div className="truncate text-[11px] text-muted-foreground/80">{subtitle}</div>
            ) : null}
          </div>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {drillKey ? (
          <button
            type="button"
            onClick={() => openDrill(drillKey)}
            aria-label={`Expand ${title}`}
            title={`Expand ${title}`}
            className="flex shrink-0 items-center justify-center rounded-r-xl border-l border-border/30 px-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <Maximize2 className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {open ? (
        <div id={bodyId} className="border-t border-border/30 px-3 py-2 text-xs text-muted-foreground">
          {children}
        </div>
      ) : null}
    </section>
  );
}
