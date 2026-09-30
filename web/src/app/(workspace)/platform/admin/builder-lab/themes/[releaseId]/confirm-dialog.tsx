"use client";

import { useEffect, useId, useRef } from "react";

/**
 * In-app confirm for the release manager (replaces window.confirm, which some
 * browsers suppress). Modal, labelled, Escape cancels, Tab stays inside, focus
 * lands on Cancel (the safe choice) and returns to the opener on close.
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Tab") {
        const first = cancelRef.current;
        const last = confirmRef.current;
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;
  const btn = "rounded border border-white/25 px-3 py-1.5 text-sm hover:bg-white/10";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-confirm-dialog>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-describedby={id}
        className="w-full max-w-md rounded-lg border border-white/20 bg-neutral-900 p-5 text-white shadow-xl"
      >
        <p id={id} className="text-sm leading-relaxed">
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className={btn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" className={`${btn} bg-white/15 font-medium`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
