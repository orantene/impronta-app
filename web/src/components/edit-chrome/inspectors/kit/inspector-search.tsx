"use client";

/**
 * Inspector find-a-setting search — INS-3 (Builder Ecosystem 2026, Phase 5).
 *
 * Architecture: a React context carries the current search query string.
 * Any InspectorSection or InspectorAccordion can opt in by wrapping itself
 * with `useInspectorSearchFilter(label)` — it returns a boolean `hidden`
 * that the consumer can use to conditionally render null (or hide).
 *
 * The search predicate is intentionally simple: case-insensitive substring
 * match on the supplied label. Each consumer registers its own label; there
 * is no global registry that can go stale when fields are added.
 *
 * The search input lives in InspectorSearchField (rendered by inspector-dock
 * at the top of the drawer body, above the tab strip). It is shown only when
 * a block is selected; cleared on block-change via the `clearKey` prop.
 *
 * Accessible: the input has role="search", aria-label, and supports Escape
 * to clear.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { Search, X } from "lucide-react";
import { CHROME } from "../../kit/tokens";

// ── Context ─────────────────────────────────────────────────────────────────

interface InspectorSearchContextValue {
  query: string;
}

const InspectorSearchContext = createContext<InspectorSearchContextValue>({
  query: "",
});

export function InspectorSearchProvider({
  query,
  children,
}: {
  query: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ query }), [query]);
  return (
    <InspectorSearchContext.Provider value={value}>
      {children}
    </InspectorSearchContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Returns `true` if the supplied `label` is filtered OUT by the current query.
 * Usage in any inspector group:
 *
 *   const hidden = useInspectorSearchFilter("Background color");
 *   if (hidden) return null;
 *
 * Pass an array of labels if a group covers multiple sub-fields — ANY match
 * makes the group visible.
 */
export function useInspectorSearchFilter(labels: string | string[]): boolean {
  const { query } = useContext(InspectorSearchContext);
  if (!query.trim()) return false;
  const q = query.toLowerCase();
  const arr = Array.isArray(labels) ? labels : [labels];
  return !arr.some((l) => l.toLowerCase().includes(q));
}

/**
 * Returns the raw search query (empty string when no search).
 * Useful for highlighting matched text if needed.
 */
export function useInspectorSearchQuery(): string {
  return useContext(InspectorSearchContext).query;
}

// ── Search field component ───────────────────────────────────────────────────

export interface InspectorSearchFieldProps {
  value: string;
  onChange: (v: string) => void;
  /** Pass a key that changes on block-selection-change to auto-clear. */
  clearKey?: string | null;
}

export function InspectorSearchField({
  value,
  onChange,
}: InspectorSearchFieldProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onChange("");
      }
    },
    [onChange],
  );

  return (
    <div
      role="search"
      aria-label="Find a setting"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      <Search
        size={13}
        aria-hidden
        style={{
          position: "absolute",
          left: 9,
          color: CHROME.muted,
          pointerEvents: "none",
          flexShrink: 0,
        }}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find a setting…"
        aria-label="Find a setting in the inspector"
        autoComplete="off"
        spellCheck={false}
        style={{
          width: "100%",
          height: 30,
          paddingLeft: 28,
          paddingRight: value ? 28 : 10,
          borderRadius: 8,
          border: `1px solid ${CHROME.controlBorder}`,
          background: CHROME.paper,
          fontSize: 12.5,
          color: CHROME.ink,
          outline: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = CHROME.blue;
          e.currentTarget.style.boxShadow = "0 0 0 2px rgba(99,102,241,0.12)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = CHROME.controlBorder;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          style={{
            position: "absolute",
            right: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            padding: 3,
            cursor: "pointer",
            color: CHROME.muted,
            borderRadius: 4,
          }}
        >
          <X size={12} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

// ── useInspectorSearch hook (state for the dock) ──────────────────────────────

/**
 * Manages the search query for the inspector dock.
 * The dock owns state; passes query to InspectorSearchProvider.
 */
export function useInspectorSearch() {
  const [query, setQuery] = useState("");

  const clear = useCallback(() => setQuery(""), []);

  return { query, setQuery, clear };
}
