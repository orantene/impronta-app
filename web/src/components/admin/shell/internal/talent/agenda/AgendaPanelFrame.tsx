"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { useAgendaCopy } from "./use-agenda-copy";

/** A tiny open/close store, one per shared panel (Working hours, New booking). */
export function createPanelStore() {
  let open = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };
  return {
    open() {
      open = true;
      emit();
    },
    close() {
      open = false;
      emit();
    },
    useOpen(): boolean {
      return useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => {
            listeners.delete(cb);
          };
        },
        () => open,
        () => false,
      );
    },
  };
}

/**
 * The shared agenda panel frame: a right drawer on desktop, a bottom sheet on a
 * phone. Backdrop click, Escape and the close button all call `onClose`.
 */
export function AgendaPanelFrame({
  title,
  onClose,
  dataAttr,
  children,
}: {
  title: string;
  onClose: () => void;
  dataAttr: string;
  children: ReactNode;
}) {
  const copy = useAgendaCopy();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80]" {...{ [dataAttr]: "" }}>
      <button type="button" aria-label={copy.t("Close")} onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute bg-white outline-none max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[90dvh] max-md:rounded-t-[20px] md:inset-y-0 md:right-0 md:w-[560px] md:max-w-full"
      >
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center gap-2 border-b border-black/10 px-5 py-3">
            <h2 className="flex-1 text-[17px] font-semibold text-[var(--tc-primary,inherit)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] rounded-full text-[15px]"
              aria-label={copy.t("Close")}
            >
              <span aria-hidden>×</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
