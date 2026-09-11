"use client";

/**
 * ScanStatus — the "Scanner ready" chip and the scan toast on the Sell
 * screen (design boards C23 and C24).
 *
 * The chip says the counter is LISTENING, which is the only thing the
 * browser can know: a keyboard-wedge scanner is a keyboard, and nothing
 * announces it. The toast is one sentence per scan, "Added <name>" or
 * "Nothing matches <code>", already interpolated by the caller from the
 * catalogue. It clears itself after a few seconds, or on Dismiss, so the
 * next scan's sentence is never mistaken for the last one's.
 */

import { useEffect } from "react";

import { cn } from "@/lib/utils";

import type { ScanCopy } from "./customer-display-copy";
import { POS_CHIP, POS_CHIP_IDLE } from "./pos-classes";

export type ScanToast = {
  readonly kind: "added" | "no_match" | "unavailable";
  readonly sentence: string;
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

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span
        data-pos-scanner-ready
        title={copy.readyHint}
        className={cn(POS_CHIP, POS_CHIP_IDLE, "cursor-default gap-2")}
      >
        <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-foreground" />
        {copy.ready}
      </span>
      {toast && (
        <div
          role="status"
          data-pos-scan-toast={toast.kind}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
            toast.kind === "added"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-foreground",
          )}
        >
          <span>{toast.sentence}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs font-semibold underline underline-offset-2"
          >
            {copy.dismiss}
          </button>
        </div>
      )}
    </div>
  );
}
