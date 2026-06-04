"use client";

/**
 * useNavigatorDisclosure + NavigatorDisclosureChevron — the React layer over the
 * pure `navigator-collapse` logic. Holds the per-node open-set (persisted to a
 * versioned localStorage key), force-reveals the selected node's ancestor path,
 * and renders the per-row disclosure chevron. Shared by the layer trees so the
 * collapse behaves identically and the host components stay small.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { CHROME } from "./kit";
import {
  computeNavigatorDisclosure,
  navigatorSelectedAncestors,
  type NavigatorDisclosureRow,
} from "./navigator-collapse";

const EXPANDED_NODES_STORAGE_KEY =
  "impronta.editChrome.navigator.expandedNodes.v1";

export interface NavigatorDisclosure<Row extends NavigatorDisclosureRow> {
  /** Rows to render (collapsed to the current open-set, pre-order preserved). */
  visibleRows: Row[];
  /** Ids that parent ≥1 child — these earn a chevron. */
  rowsWithChildren: Set<string>;
  isNodeOpen: (id: string) => boolean;
  toggleNode: (id: string) => void;
}

export function useNavigatorDisclosure<Row extends NavigatorDisclosureRow>(
  rows: readonly Row[],
  selectedId: string | null | undefined,
): NavigatorDisclosure<Row> {
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EXPANDED_NODES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setExpandedNodeIds(
          new Set(parsed.filter((v): v is string => typeof v === "string")),
        );
      }
    } catch {
      setExpandedNodeIds(new Set());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        EXPANDED_NODES_STORAGE_KEY,
        JSON.stringify([...expandedNodeIds]),
      );
    } catch {
      // Local persistence is a convenience only.
    }
  }, [hydrated, expandedNodeIds]);

  const selectedAncestors = useMemo(
    () => navigatorSelectedAncestors(rows, selectedId),
    [rows, selectedId],
  );
  const isNodeOpen = useCallback(
    (id: string) => expandedNodeIds.has(id) || selectedAncestors.has(id),
    [expandedNodeIds, selectedAncestors],
  );
  const { visible, withChildren } = useMemo(
    () => computeNavigatorDisclosure(rows, isNodeOpen),
    [rows, isNodeOpen],
  );
  const toggleNode = useCallback((id: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    visibleRows: visible,
    rowsWithChildren: withChildren,
    isNodeOpen,
    toggleNode,
  };
}

/** The per-row disclosure chevron (renders nothing for childless rows). */
export function NavigatorDisclosureChevron({
  hasChildren,
  open,
  label,
  indentLeft,
  onToggle,
}: {
  hasChildren: boolean;
  open: boolean;
  label: string;
  indentLeft: number;
  onToggle: () => void;
}) {
  if (!hasChildren) return null;
  return (
    <button
      type="button"
      data-navigator-node-disclosure=""
      aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
      aria-expanded={open}
      title={open ? "Collapse" : "Expand"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        position: "absolute",
        left: indentLeft,
        top: "50%",
        transform: "translateY(-50%)",
        width: 13,
        height: 18,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        border: "none",
        background: "transparent",
        color: CHROME.muted,
        cursor: "pointer",
        lineHeight: 1,
        fontSize: 9,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 120ms ease",
        }}
      >
        ▸
      </span>
    </button>
  );
}
