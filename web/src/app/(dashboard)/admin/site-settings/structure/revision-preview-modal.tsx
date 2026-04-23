"use client";

/**
 * Revision preview modal.
 *
 * Admins used to click "Restore as draft" on a bare row of date + kind +
 * version — no way to see what the revision actually contained. This
 * modal fixes that trust gap: click Preview on a revision, see a
 * non-destructive summary of its composition + metadata, then decide
 * whether to restore.
 *
 * Restore runs through the existing restoreHomepageRevisionAction; the
 * modal submits a hidden form that the composer supplies via a ref. No
 * server-side change — the modal is purely a review layer.
 */

import { useEffect, useRef, useState } from "react";
import { Layers, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface RevisionOpenDescriptor {
  id: string;
  kind: string;
  version: number;
  createdAt: string;
}

interface RevisionSummary {
  slots: Array<{
    slotKey: string;
    items: Array<{
      name: string;
      sectionTypeKey: string;
      sortOrder: number;
    }>;
  }>;
  totalSections: number;
  title: string | null;
  metaDescription: string | null;
  introTagline: string | null;
}

interface Props {
  open: RevisionOpenDescriptor | null;
  onCancel: () => void;
  onRestore: (revisionId: string) => void;
  restorePending: boolean;
  /** Human-label lookup for section type keys. Passed from composer. */
  labelForType: (key: string) => string;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function RevisionPreviewModal({
  open,
  onCancel,
  onRestore,
  restorePending,
  labelForType,
}: Props) {
  const [summary, setSummary] = useState<RevisionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setSummary(null);
      setError(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/homepage-revision/${encodeURIComponent(open!.id)}`,
          { cache: "no-store" },
        );
        const body = await res.json();
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setSummary(body.summary as RevisionSummary);
      } catch (e) {
        if (!cancelled) setError(String(e).slice(0, 200));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !restorePending) onCancel();
    }
    document.addEventListener("keydown", onKey);
    window.setTimeout(() => dialogRef.current?.focus(), 30);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, restorePending]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Revision preview"
      onClick={(e) => {
        if (e.target === e.currentTarget && !restorePending) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[85vh] w-[min(100%,640px)] flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/40 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              Preview revision · v{open.version}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 uppercase tracking-wide">
                {open.kind}
              </span>{" "}
              · {formatWhen(open.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={restorePending}
            className="rounded-md border border-border/60 p-1.5 text-muted-foreground transition hover:bg-muted/40 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading revision…</p>
          ) : error ? (
            <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Couldn&apos;t load revision — {error}
            </p>
          ) : summary ? (
            <div className="space-y-5">
              {/* Meta fields */}
              {(summary.title ||
                summary.metaDescription ||
                summary.introTagline) && (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Homepage fields
                  </h3>
                  <dl className="mt-2 space-y-2 text-sm">
                    {summary.title ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">Title</dt>
                        <dd>{summary.title}</dd>
                      </div>
                    ) : null}
                    {summary.metaDescription ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Meta description
                        </dt>
                        <dd className="text-foreground/90">
                          {summary.metaDescription}
                        </dd>
                      </div>
                    ) : null}
                    {summary.introTagline ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Intro tagline
                        </dt>
                        <dd className="text-foreground/90">
                          {summary.introTagline}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>
              )}

              {/* Composition */}
              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Composition
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium">
                    <Layers className="size-3" />
                    {summary.totalSections} sections
                  </span>
                </div>
                {summary.slots.length === 0 ? (
                  <p className="mt-2 rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-4 text-center text-sm text-muted-foreground">
                    No sections in this revision — restoring would leave the
                    composer empty.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {summary.slots.map((slot) => (
                      <li
                        key={slot.slotKey}
                        className="rounded-md border border-border/50 bg-muted/10 p-3"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {slot.slotKey}
                        </div>
                        <ul className="mt-1.5 space-y-1">
                          {slot.items.map((item, i) => (
                            <li
                              key={`${slot.slotKey}-${i}`}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className="font-medium">{item.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {labelForType(item.sectionTypeKey)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border/40 bg-muted/10 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Restoring creates a <em>new draft</em> from this revision. Your
            current unsaved draft will be overwritten.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={restorePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onRestore(open.id)}
              disabled={restorePending || loading || !!error}
            >
              {restorePending ? "Restoring…" : "Restore as draft"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
