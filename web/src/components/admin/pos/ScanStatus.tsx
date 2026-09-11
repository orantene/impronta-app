"use client";

/**
 * ScanStatus — C24's toast, as `POSScanProduct` draws it: a card pinned to
 * the bottom-left of the sell surface with a green check, `Added · Shampoo
 * 250ml · $310`, the second line `In stock · scanner ready for the next
 * code`, and `Undo`. A miss (`Nothing matches …`) draws the same card in
 * the coral tone with no Undo.
 *
 * `data-pos-scan-toast="<kind>"` names the outcome for a browser test. The
 * toast clears itself after `SCAN_TOAST_MS`, so the next scan's sentence is
 * never the last one's; `Dismiss` is the one tap a cashier has on it before
 * that, and `Undo` removes the line the scan added.
 */

import { AlertTriangle, Check, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

import type { ScanCopy } from "./customer-display-copy";
import { POS_SECONDARY_ACTION } from "./pos-classes";

export type ScanToast = {
  readonly kind: "added" | "no_match" | "unavailable";
  readonly sentence: string;
  readonly detail?: string;
  /** Present on an `added` toast whose line can still be removed. */
  readonly onUndo?: () => void;
};

export const SCAN_TOAST_MS = 4_000;

export type ScanStatusProps = {
  readonly toast: ScanToast | null;
  readonly onDismiss: () => void;
  readonly copy: ScanCopy;
  readonly className?: string;
};

export function ScanStatus({ toast, onDismiss, copy, className }: ScanStatusProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, SCAN_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const added = toast.kind === "added";
  return (
    <div
      role="status"
      data-pos-scan-toast={toast.kind}
      className={cn(
        "absolute bottom-6 left-6 z-10 flex w-[520px] max-w-[calc(100%-3rem)] items-center gap-3.5 rounded-[14px] border-l-4 bg-admin-card px-4 py-3.5 shadow-admin-hover",
        added ? "border-admin-success" : "border-admin-coral",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]",
          added ? "bg-admin-success-soft text-admin-success" : "bg-admin-coral-soft text-admin-coral-deep",
        )}
      >
        {added ? <Check aria-hidden size={22} strokeWidth={2} /> : <AlertTriangle aria-hidden size={22} strokeWidth={1.75} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-admin-ink">{toast.sentence}</span>
        {toast.detail && <span className="block truncate text-[14px] text-admin-ink-muted">{toast.detail}</span>}
      </span>
      {toast.onUndo && (
        <button type="button" data-pos-scan-undo onClick={toast.onUndo} className={cn(POS_SECONDARY_ACTION, "h-11 px-4 text-[14px]")}>
          {copy.undo}
        </button>
      )}
      <button
        type="button"
        aria-label={copy.dismiss}
        onClick={onDismiss}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-admin-ink-dim hover:bg-admin-surface-alt"
      >
        <X aria-hidden size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
