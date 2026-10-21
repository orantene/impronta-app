"use client";

import { useEffect, useRef, type RefObject } from "react";

import { CHAT_OPENER_SELECTOR, isKeyboardReachable, pickFocusReturnTarget } from "./dock-focus-return";

/**
 * TUL-1082: when the dock closes, hand focus back to the control that opened it
 * (catalog bar / selection dock chat button), else the launcher, else any
 * visible chat opener. The launcher unmounts while the dock is open and is
 * hidden when the catalog carries its own chat button.
 */
export function useDockFocusReturn(open: boolean, pillRef: RefObject<HTMLElement | null>): void {
  const wasOpenRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) return undefined;
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && e.target !== document.body) openerRef.current = e.target;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      const raf = requestAnimationFrame(() => {
        const target = pickFocusReturnTarget<HTMLElement>(
          [openerRef.current, pillRef.current, ...Array.from(document.querySelectorAll<HTMLElement>(CHAT_OPENER_SELECTOR))],
          isKeyboardReachable,
        );
        target?.focus({ preventScroll: true });
      });
      wasOpenRef.current = false;
      return () => cancelAnimationFrame(raf);
    }
    wasOpenRef.current = open;
    return undefined;
  }, [open, pillRef]);
}

/** Move focus into the dock on open: the composer on desktop, the dialog itself otherwise. */
export function focusIntoDock(phone: boolean, composer: { focus: (options?: FocusOptions) => void } | null): void {
  if (!phone) composer?.focus({ preventScroll: true } as FocusOptions);
  const panel = document.querySelector<HTMLElement>("[data-guest-chat-panel]");
  if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
}
