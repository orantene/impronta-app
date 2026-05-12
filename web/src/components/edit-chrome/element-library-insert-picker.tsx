"use client";

/**
 * P7A-1 — governed element insert picker (search + category grouping).
 * Parent menus supply `allowedKinds` (already intersected with registry + plan gate).
 */

import { useId, useMemo, useState } from "react";

import {
  BUILDER_NODE_REGISTRY,
  ELEMENT_LIBRARY_CATEGORY_LABEL,
  ELEMENT_LIBRARY_CATEGORY_ORDER,
  elementLibraryCategoryForKind,
  elementLibraryPrimaryLabel,
  elementLibrarySearchExtraTerms,
  sortKindsForElementLibraryCatalog,
  type BuilderNodeKind,
  type ElementLibraryCategory,
} from "@/lib/site-admin/builder-node";

import { CHROME } from "./kit";

export function ElementLibraryInsertPicker({
  allowedKinds,
  onPick,
  variant,
}: {
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  onPick: (kind: BuilderNodeKind) => void | Promise<void>;
  variant: "navigator" | "canvas" | "inspector";
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const sorted = sortKindsForElementLibraryCatalog(allowedKinds);
    const q = query.trim().toLowerCase();
    const match = (kind: BuilderNodeKind) => {
      if (!q) return true;
      const hay = [
        elementLibraryPrimaryLabel(kind),
        BUILDER_NODE_REGISTRY[kind].description,
        kind.replace(/_/g, " "),
        elementLibrarySearchExtraTerms(kind),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };

    const buckets = new Map<ElementLibraryCategory, BuilderNodeKind[]>();
    for (const cat of ELEMENT_LIBRARY_CATEGORY_ORDER) {
      buckets.set(cat, []);
    }
    for (const kind of sorted) {
      if (!match(kind)) continue;
      const cat = elementLibraryCategoryForKind(kind);
      buckets.get(cat)!.push(kind);
    }

    return ELEMENT_LIBRARY_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      kinds: buckets.get(cat) ?? [],
    })).filter((g) => g.kinds.length > 0);
  }, [allowedKinds, query]);

  const isNavigator = variant === "navigator";
  const isCanvas = variant === "canvas";
  const isInspector = variant === "inspector";

  const searchStyle =
    isNavigator
      ? {
          width: "100%" as const,
          marginBottom: 8,
          padding: "6px 8px",
          fontSize: 11,
          borderRadius: 0,
          border: `1px solid ${CHROME.line}`,
          background: CHROME.paper,
          color: CHROME.text,
          outline: "none" as const,
          boxSizing: "border-box" as const,
        }
      : isInspector
        ? {
            width: "100%" as const,
            marginBottom: 8,
            padding: "6px 8px",
            fontSize: 11,
            borderRadius: 6,
            border: "1px solid rgb(199 210 254)",
            background: "white",
            color: "rgb(41 37 36)",
            outline: "none" as const,
            boxSizing: "border-box" as const,
          }
        : {
            width: "100%" as const,
            marginBottom: 8,
            padding: "6px 8px",
            fontSize: 11,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            outline: "none" as const,
            boxSizing: "border-box" as const,
          };

  const emptySearchColor = isNavigator
    ? CHROME.muted
    : isInspector
      ? "rgb(87 83 78)"
      : "rgba(255,255,255,0.62)";

  const categoryLabelColor = isNavigator
    ? CHROME.muted2
    : isInspector
      ? "rgb(79 70 229)"
      : "rgba(255,255,255,0.45)";

  if (allowedKinds.length === 0) {
    return (
      <div
        role="alert"
        aria-live="polite"
        aria-atomic="true"
        data-element-library-catalog-empty=""
        style={{
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.45,
          color: emptySearchColor,
          padding: "8px 2px",
        }}
      >
        No elements can be inserted here right now (catalog empty). Reload the page
        or pick another section — if this persists, the builder tree may still be
        loading.
      </div>
    );
  }

  return (
    <>
      <label className="sr-only" htmlFor={searchId}>
        Search elements
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search elements…"
        autoComplete="off"
        data-element-library-search=""
        style={searchStyle}
      />
      <div
        data-element-library-groups=""
        style={{
          maxHeight: isInspector ? 220 : 200,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {grouped.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: emptySearchColor,
            }}
          >
            No elements match this search.
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.category} data-element-library-category={group.category}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: categoryLabelColor,
                  marginBottom: 6,
                }}
              >
                {ELEMENT_LIBRARY_CATEGORY_LABEL[group.category]}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {group.kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    data-element-library-kind={kind}
                    data-builder-node-insert-kind={kind}
                    {...(isCanvas ? { "data-builder-node-canvas-insert-kind": kind } : {})}
                    {...(isInspector ? { "data-builder-node-inspector-insert-kind": kind } : {})}
                    onClick={() => void onPick(kind)}
                    style={{
                      minHeight: isNavigator ? 24 : 25,
                      padding: "0 8px",
                      borderRadius: isNavigator ? 999 : 6,
                      border: isNavigator
                        ? `1px solid ${CHROME.line}`
                        : isInspector
                          ? "1px solid rgb(199 210 254)"
                          : "1px solid rgba(255,255,255,0.12)",
                      background: isNavigator
                        ? CHROME.paper
                        : isInspector
                          ? "white"
                          : "rgba(255,255,255,0.07)",
                      color: isNavigator
                        ? CHROME.text
                        : isInspector
                          ? "rgb(41 37 36)"
                          : "white",
                      fontSize: 10.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {elementLibraryPrimaryLabel(kind)}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
