"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dockToastMs, type DockToast } from "./selection-dock-state";

/**
 * TO-1: the catalog dock's toast. Plain confirmations ("X en tu cita") last
 * 2.6 s; toasts that carry "Deshacer" last 5 s (see `dockToastMs`).
 */
export function useDockToast(): {
  toast: DockToast | null;
  showToast: (next: DockToast) => void;
  clearToast: () => void;
} {
  const [toast, setToast] = useState<DockToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);
  const showToast = useCallback((next: DockToast) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), dockToastMs(next.kind));
  }, []);
  useEffect(() => clearToast, [clearToast]);
  return { toast, showToast, clearToast };
}
