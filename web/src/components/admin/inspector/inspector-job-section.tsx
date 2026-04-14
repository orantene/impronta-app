"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InspectorJob } from "@/lib/admin/admin-inspector/types";

const STORAGE_KEY = "admin-inspector-job-open-v1";

function readJobOpen(): Record<InspectorJob, boolean> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return null;
    const o = p as Record<string, unknown>;
    const out: Record<InspectorJob, boolean> = {
      context: o.context === false ? false : true,
      suggestions: o.suggestions === false ? false : true,
      actions: o.actions === false ? false : true,
    };
    return out;
  } catch {
    return null;
  }
}

function persistJobOpen(next: Record<InspectorJob, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

const JOB_LABEL: Record<InspectorJob, string> = {
  context: "Context",
  suggestions: "Suggestions",
  actions: "Quick actions",
};

export function InspectorJobSection({
  job,
  children,
}: {
  job: InspectorJob;
  children: React.ReactNode;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const stored = readJobOpen();
    if (stored && typeof stored[job] === "boolean") {
      setOpen(stored[job]!);
    } else {
      setOpen(job === "context");
    }
  }, [job]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const nextOpen = !prev;
      const stored = readJobOpen() ?? {
        context: true,
        suggestions: true,
        actions: true,
      };
      persistJobOpen({ ...stored, [job]: nextOpen });
      return nextOpen;
    });
  }, [job]);

  if (!children) return null;

  return (
    <div className="rounded-xl ring-1 ring-[var(--admin-gold-border)]/45">
      <button
        type="button"
        id={`${baseId}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-t-xl px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-gold-muted)] transition-colors",
          "hover:bg-[var(--admin-workspace-surface)]/80 hover:text-[var(--admin-workspace-fg)]",
          !open && "rounded-b-xl",
        )}
      >
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-[var(--admin-gold)]/80 transition-transform", !open && "-rotate-90")}
          aria-hidden
        />
        {JOB_LABEL[job]}
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`${baseId}-trigger`}
        className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className={cn("min-h-0 overflow-hidden", !open && "pointer-events-none")} aria-hidden={!open}>
          <div className="space-y-3 border-t border-[var(--admin-gold-border)]/35 px-3 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
