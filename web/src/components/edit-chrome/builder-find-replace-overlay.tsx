"use client";

/**
 * Project-wide find/replace across builder node text fields (Builder 2026 M6).
 */

import { useCallback, useMemo, useState } from "react";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { useEditContext } from "./edit-context";
import { useModalFocusTrap } from "./modal-focus-trap";
import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./kit/tokens";

interface FindReplaceHit {
  nodeId: string;
  field: string;
  preview: string;
}

function collectTextHits(
  nodes: readonly BuilderNode[],
  query: string,
  hits: FindReplaceHit[] = [],
): FindReplaceHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return hits;
  for (const node of nodes) {
    const props = node.props as Record<string, unknown>;
    for (const field of ["text", "label", "title", "alt"] as const) {
      const raw = props[field];
      if (typeof raw === "string" && raw.toLowerCase().includes(q)) {
        hits.push({
          nodeId: node.id,
          field,
          preview: raw.slice(0, 80),
        });
      }
    }
    if ("children" in node && Array.isArray(node.children)) {
      collectTextHits(node.children as BuilderNode[], query, hits);
    }
  }
  return hits;
}

function collectPatches(
  nodes: readonly BuilderNode[],
  query: string,
  replacement: string,
  out: Map<string, Record<string, string>> = new Map(),
): Map<string, Record<string, string>> {
  const q = query.trim();
  if (!q) return out;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  for (const node of nodes) {
    const props = node.props as Record<string, unknown>;
    const patch: Record<string, string> = {};
    for (const field of ["text", "label", "title", "alt"] as const) {
      const raw = props[field];
      if (typeof raw === "string" && re.test(raw)) {
        patch[field] = raw.replace(re, replacement);
      }
      re.lastIndex = 0;
    }
    if (Object.keys(patch).length > 0) out.set(node.id, patch);
    if ("children" in node && Array.isArray(node.children)) {
      collectPatches(node.children as BuilderNode[], query, replacement, out);
    }
  }
  return out;
}

interface BuilderFindReplaceOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function BuilderFindReplaceOverlay({
  open,
  onClose,
}: BuilderFindReplaceOverlayProps) {
  const { builderTree, patchBuilderNodeProps, selectBuilderNode, reportMutationError } =
    useEditContext();
  const dialogRef = useModalFocusTrap(open, onClose);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");

  const hits = useMemo(
    () => collectTextHits(builderTree, query),
    [builderTree, query],
  );

  const onReplaceAll = useCallback(async () => {
    if (!query.trim()) return;
    const patches = collectPatches(builderTree, query, replacement);
    for (const [nodeId, patch] of patches) {
      const result = await patchBuilderNodeProps(nodeId, patch);
      if (!result.ok && result.error) {
        reportMutationError(result.error);
        return;
      }
    }
    onClose();
  }, [
    builderTree,
    patchBuilderNodeProps,
    query,
    replacement,
    reportMutationError,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 130,
        background: "rgba(11, 11, 13, 0.42)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-replace-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100%)",
          background: CHROME.paper,
          border: `1px solid ${CHROME.lineMid}`,
          borderRadius: CHROME_RADII.lg,
          boxShadow: CHROME_SHADOWS.popover,
          padding: 20,
          display: "grid",
          gap: 12,
        }}
      >
        <h2 id="find-replace-title" style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>
          Find & replace
        </h2>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Find
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 7,
              border: `1px solid ${CHROME.controlBorder}`,
              background: CHROME.controlFill,
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Replace with
          <input
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 7,
              border: `1px solid ${CHROME.controlBorder}`,
              background: CHROME.controlFill,
            }}
          />
        </label>
        <p style={{ margin: 0, fontSize: 11, color: CHROME.muted }}>
          {hits.length} match{hits.length === 1 ? "" : "es"} in headings, labels,
          buttons, and alt text.
        </p>
        {hits.length > 0 ? (
          <ul
            style={{
              margin: 0,
              padding: "8px 10px",
              maxHeight: 120,
              overflowY: "auto",
              fontSize: 11,
              background: CHROME.surface,
              borderRadius: CHROME_RADII.sm,
              border: `1px solid ${CHROME.line}`,
            }}
          >
            {hits.slice(0, 8).map((hit) => (
              <li key={`${hit.nodeId}:${hit.field}`}>
                <button
                  type="button"
                  onClick={() => {
                    selectBuilderNode(hit.nodeId);
                    onClose();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "2px 0",
                    cursor: "pointer",
                    color: CHROME.accentInk,
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  {hit.preview}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: "6px 12px" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!query.trim() || hits.length === 0}
            onClick={() => void onReplaceAll()}
            style={{
              padding: "6px 12px",
              fontWeight: 600,
              background: CHROME.accent,
              color: "white",
              border: "none",
              borderRadius: 7,
              opacity: !query.trim() || hits.length === 0 ? 0.5 : 1,
            }}
          >
            Replace all
          </button>
        </div>
      </div>
    </div>
  );
}
