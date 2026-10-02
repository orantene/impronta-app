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
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function AgendaPanelFrame({
  title,
  subtitle,
  onClose,
  dataAttr,
  footer,
  children,
}: {
  title: string;
  /** A short line under the title, e.g. "Step 2 of 3". */
  subtitle?: string;
  onClose: () => void;
  dataAttr: string;
  /** Sticky primary actions. Stays above the home indicator and the soft keyboard on a phone. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const copy = useAgendaCopy();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // Focus trap: Tab and Shift+Tab stay inside the dialog.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

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
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold text-[var(--tc-primary,inherit)]">{title}</h2>
              {subtitle ? <p className="text-[12.5px] text-black/55">{subtitle}</p> : null}
            </div>
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
          {footer ? (
            <div className="shrink-0 border-t border-black/10 bg-white px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
