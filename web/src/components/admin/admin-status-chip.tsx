/**
 * Phase 16 / Admin shell v3 — unified status chip (monochrome scrub).
 *
 * One vocabulary for state across every admin surface (sections, pages,
 * talent, inquiries, Home attention strip, sidebar badges).
 *
 * Phase 16 removes the amber/emerald/rose/sky palette in favour of a
 * monochrome system built on the foreground/muted tokens. State is now
 * conveyed by **fill density** + a small leading dot, not by hue. This
 * matches the rest of the admin shell (AdminSurfaceCard tones already use
 * foreground-based borders) and reflects the operator-feedback that
 * coloured accents were noisy and inconsistent across light/dark themes.
 *
 * States (all monochrome)
 *   draft     — dashed outline, muted text       — unpublished WIP
 *   live      — solid filled dot, bold text       — published
 *   published — alias for "live"
 *   attention — heaviest fill + ring              — operator action needed
 *   pending   — dotted border                     — awaiting external signal
 *   archived  — ghosted                           — retired
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
  /** Container classes (border + bg + text). */
  classes: string;
  /** Leading dot classes — null when no dot. */
  dot: string | null;
  label: string;
}

const TONES: Record<AdminStatusChipState, Tone> = {
  draft: {
    classes:
      "border-dashed border-foreground/30 bg-transparent text-muted-foreground",
    dot: "bg-foreground/40",
    label: "Draft",
  },
  live: {
    classes: "border-foreground/70 bg-foreground/10 text-foreground",
    dot: "bg-foreground",
    label: "Live",
  },
  published: {
    classes: "border-foreground/70 bg-foreground/10 text-foreground",
    dot: "bg-foreground",
    label: "Published",
  },
  attention: {
    classes:
      "border-foreground bg-foreground text-background ring-2 ring-foreground/15 ring-offset-1 ring-offset-background",
    dot: null,
    label: "Needs attention",
  },
  pending: {
    classes:
      "border-dotted border-foreground/40 bg-transparent text-foreground/80",
    dot: "bg-foreground/60",
    label: "Pending",
  },
  archived: {
    classes: "border-border/60 bg-muted/30 text-muted-foreground/80",
    dot: null,
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
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone.classes,
        className,
      )}
      title={title ?? `Status: ${display}`}
    >
      {tone.dot ? (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", tone.dot)}
        />
      ) : null}
      {display}
    </span>
  );
}
