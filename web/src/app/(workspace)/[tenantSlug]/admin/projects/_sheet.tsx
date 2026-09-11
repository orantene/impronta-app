"use client";

/**
 * RecordSheet — the 640px panel the record boards open on the right (W44
 * Collect, W48 Replace, W50 Close): a dimmed page, a header with title and
 * subtitle and a close button, a scrolling body, and a footer with the
 * quiet action on the left and the decisive ones on the right.
 *
 * `role="dialog"` with `aria-modal`, closes on Escape, focus lands on the
 * close button when it opens. Renders nothing when closed so the page under
 * it keeps its DOM exactly as it was.
 */

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

export function RecordSheet({
  open,
  title,
  subtitle,
  closeLabel,
  onClose,
  children,
  footerStart,
  footerEnd,
  name,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
  /** A test hook: `data-record-sheet="close"`. */
  name: string;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex justify-end" data-record-overlay>
      <button type="button" aria-label={closeLabel} tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-admin-ink/30" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-record-sheet={name}
        className="relative flex h-full w-[640px] max-w-full flex-col bg-admin-card shadow-admin-hover"
      >
        <div className="flex items-start gap-3 border-b border-admin-border-soft px-[22px] py-[18px]">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[16px]! font-semibold text-admin-ink">
              {title}
            </h2>
            {subtitle ? <p className="m-0 mt-0.5 text-[12.5px] text-admin-ink-muted">{subtitle}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-admin-ink-muted hover:bg-admin-surface-alt"
          >
            <X aria-hidden size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[22px] py-[18px]">{children}</div>
        {footerStart || footerEnd ? (
          <div data-record-sheet-footer className="flex items-center gap-2 border-t border-admin-border-soft px-[22px] py-3.5">
            {footerStart}
            <span className="flex-1" />
            {footerEnd}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
