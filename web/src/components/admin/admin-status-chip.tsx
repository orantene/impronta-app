/**
 * Phase 15 / Admin shell v2 — unified status chip.
 *
 * One vocabulary for state across every admin surface (sections, pages,
 * talent, inquiries, Home attention strip, sidebar badges). Replaces the
 * near-duplicate `SectionStatusBadge` + `PageStatusBadge` helpers — both
 * of those now alias to this component so existing callers keep working
 * while the vocabulary expands.
 *
 * States
 *   draft       — amber  — unpublished work in progress
 *   live        — emerald — published, in production (alias: "published")
 *   attention   — rose   — needs operator action (overdue, failing, blocking)
 *   pending     — sky    — awaiting approval / external signal
 *   archived    — muted  — retired but not deleted
 *
 * Usage
 *   <AdminStatusChip state="draft" />
 *   <AdminStatusChip state="live" label="Live on midnight.local" />
 *   <AdminStatusChip state="attention" />
 */

import { cn } from "@/lib/utils";

export type AdminStatusChipState =
  | "draft"
  | "live"
  | "published" // alias for "live"
  | "attention"
  | "pending"
  | "archived";

interface Tone {
  classes: string;
  label: string;
}

const TONES: Record<AdminStatusChipState, Tone> = {
  draft: {
    classes: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    label: "Draft",
  },
  live: {
    classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    label: "Live",
  },
  published: {
    classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    label: "Published",
  },
  attention: {
    classes: "bg-rose-500/15 text-rose-400 border-rose-500/35",
    label: "Needs attention",
  },
  pending: {
    classes: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    label: "Pending",
  },
  archived: {
    classes: "bg-muted/40 text-muted-foreground border-border/60",
    label: "Archived",
  },
};

export function AdminStatusChip({
  state,
  label,
  className,
  title,
}: {
  state: AdminStatusChipState;
  /** Overrides the default label (e.g. "3 drafts" instead of "Draft"). */
  label?: string;
  className?: string;
  /** Hover title — defaults to `Status: <label>` when omitted. */
  title?: string;
}) {
  const tone = TONES[state] ?? TONES.draft;
  const display = label ?? tone.label;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone.classes,
        className,
      )}
      title={title ?? `Status: ${display}`}
    >
      {display}
    </span>
  );
}
