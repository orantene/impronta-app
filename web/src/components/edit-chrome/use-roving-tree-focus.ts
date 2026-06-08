"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * WAI-ARIA tree keyboard pattern — roving tabindex on `[role="treeitem"]` rows.
 * ArrowUp/Down move focus; Home/End jump; typeahead selects by label prefix.
 */
export function useRovingTreeFocus(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items = useCallback((): HTMLElement[] => {
    const root = containerRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>('[role="treeitem"][tabindex]'),
    );
  }, [containerRef]);

  const focusItem = useCallback(
    (index: number) => {
      const rows = items();
      if (rows.length === 0) return;
      const next = rows[Math.max(0, Math.min(index, rows.length - 1))];
      rows.forEach((row, i) => {
        row.tabIndex = i === index ? 0 : -1;
      });
      next.focus();
    },
    [items],
  );

  useEffect(() => {
    if (!enabled) return;
    const root = containerRef.current;
    if (!root) return;

    const rows = items();
    if (rows.length === 0) return;
    let focused = rows.findIndex((r) => r.tabIndex === 0);
    if (focused < 0) {
      rows.forEach((row, i) => {
        row.tabIndex = i === 0 ? 0 : -1;
      });
      focused = 0;
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('[role="treeitem"]')) return;
      const rowsNow = items();
      const current = rowsNow.indexOf(target);
      if (current < 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(current + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItem(current - 1);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        focusItem(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        focusItem(rowsNow.length - 1);
        return;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const char = e.key.toLowerCase();
        if (!/^[a-z0-9]$/.test(char)) return;
        e.preventDefault();
        typeaheadRef.current += char;
        if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
        typeaheadTimerRef.current = setTimeout(() => {
          typeaheadRef.current = "";
        }, 400);
        const prefix = typeaheadRef.current;
        const match = rowsNow.findIndex((row) => {
          const label =
            row.getAttribute("aria-label") ?? row.textContent ?? "";
          return label.trim().toLowerCase().startsWith(prefix);
        });
        if (match >= 0) focusItem(match);
      }
    }

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    };
  }, [containerRef, enabled, focusItem, items]);
}

export function useLayersTreeContainer(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useRovingTreeFocus(ref, true);
  return ref;
}
