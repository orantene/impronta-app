"use client";

/**
 * Publish pre-flight review modal.
 *
 * Opens when an admin clicks "Review + publish" on the composer. Gives
 * them a single trust surface where they can:
 *   - See what's blocking publish (no surprises on server reject).
 *   - See non-blocking warnings (draft refs count, etc.).
 *   - Jump to the specific section / slot that needs attention.
 *   - Confirm publish from a polished primary button.
 *
 * Keeps the underlying form + server action unchanged — this component
 * is a review layer on top.
 */

import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export interface PreflightBlocker {
  kind: "missing-required-slot" | "draft-section-ref";
  /** Primary human-readable label for the row. */
  label: string;
  /** Optional supporting detail (e.g. section type, slot key). */
  detail?: string;
  /** Optional URL to open the offending resource (new tab). */
  href?: string;
  /** Optional in-page anchor to jump to (e.g. `#slot-hero`). */
  anchor?: string;
}

export interface PreflightWarning {
  label: string;
  detail?: string;
}

interface Props {
  open: boolean;
  onCancel: () => void;
  /** Submit the already-prepared form — caller is responsible for its fields. */
  onConfirm: () => void;
  pending: boolean;
  /** Block publish when any present. */
  blockers: PreflightBlocker[];
  /** Non-blocking advisories shown inline. */
  warnings: PreflightWarning[];
  /** Summary numbers to reassure the operator about scale of change. */
  summary: {
    slotsWithSections: number;
    totalSections: number;
    draftRefs: number;
  };
}

export function PublishPreflightModal({
  open,
  onCancel,
  onConfirm,
  pending,
  blockers,
  warnings,
  summary,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    // Focus the dialog container so Tab cycles within.
    window.setTimeout(() => dialogRef.current?.focus(), 30);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const hasBlockers = blockers.length > 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Review and publish"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[88vh] w-[min(100%,640px)] flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl"
      >
        {/* ── Header ── */}
        <header className="flex items-start justify-between gap-4 border-b border-border/40 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Review + publish</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Publishing promotes the draft composition to the live
              storefront and freezes each section's content into the
              published snapshot. You can always roll back from the
              Revisions panel.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-border/60 p-1.5 text-muted-foreground transition hover:bg-muted/40 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* ── Summary ── */}
        <div className="grid grid-cols-3 gap-3 border-b border-border/30 bg-muted/10 px-5 py-3 text-center">
          <div>
            <div className="text-lg font-semibold">
              {summary.slotsWithSections}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              slots with sections
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              {summary.totalSections}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              sections total
            </div>
          </div>
          <div>
            <div
              className={`text-lg font-semibold ${
                summary.draftRefs > 0 ? "text-amber-300" : ""
              }`}
            >
              {summary.draftRefs}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              draft-status refs
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {hasBlockers ? (
            <section aria-labelledby="preflight-blockers-heading">
              <h3
                id="preflight-blockers-heading"
                className="flex items-center gap-2 text-sm font-semibold text-destructive"
              >
                <ShieldAlert className="size-4" />
                Must fix before publish
                <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium">
                  {blockers.length}
                </span>
              </h3>
              <ul className="mt-2 space-y-2">
                {blockers.map((b, i) => (
                  <li
                    key={`${b.kind}-${i}`}
                    className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{b.label}</p>
                      {b.detail ? (
                        <p className="text-xs text-muted-foreground">
                          {b.detail}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {b.anchor ? (
                        <a
                          href={b.anchor}
                          onClick={() => onCancel()}
                          className="rounded-md border border-border/60 px-2 py-1 text-xs transition hover:bg-muted/40"
                        >
                          Go to slot
                        </a>
                      ) : null}
                      {b.href ? (
                        <a
                          href={b.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs transition hover:bg-muted/40"
                        >
                          Open
                          <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 className="size-4" />
                No blockers — ready to publish.
              </div>
              <p className="mt-1 text-xs text-emerald-300/80">
                Every required slot is filled and every referenced
                section is published.
              </p>
            </section>
          )}

          {warnings.length > 0 ? (
            <section aria-labelledby="preflight-warnings-heading">
              <h3
                id="preflight-warnings-heading"
                className="flex items-center gap-2 text-sm font-semibold text-amber-300"
              >
                <AlertTriangle className="size-4" />
                Worth a second look
                <span className="rounded-full bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-medium">
                  {warnings.length}
                </span>
              </h3>
              <ul className="mt-2 space-y-1.5">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs"
                  >
                    <Clock className="mt-0.5 size-3.5 text-amber-300" />
                    <div>
                      <p className="font-medium">{w.label}</p>
                      {w.detail ? (
                        <p className="mt-0.5 text-muted-foreground">
                          {w.detail}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* ── Footer ── */}
        <footer className="flex items-center justify-between gap-3 border-t border-border/40 bg-muted/10 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {hasBlockers
              ? "Resolve the blockers above to enable publish."
              : "Publishing is reversible from Revisions."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onConfirm}
              disabled={pending || hasBlockers}
              title={
                hasBlockers
                  ? "Resolve the blockers to enable publish"
                  : "Publish the draft to the live storefront"
              }
            >
              {pending ? "Publishing…" : "Publish to live"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
