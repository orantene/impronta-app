"use client";

/**
 * SearchTalentField — standalone debounced roster search.
 *
 * Plan: web/docs/message-impronta-inquiry-sync-plan-2026-06-24.md §4.B.3, P2-T2.
 *
 * Single implementation of "search the roster by name, see name + thumb, Add".
 * Used inside `InquiryDrawer`'s `TalentSection` today; exported so the unified
 * chat surface (talent-pick card / details rail) reuses the exact same control
 * instead of forking a second roster search.
 *
 * Behaviour:
 *  - Debounced filter (~250ms) over the passed-in roster (name + type/city).
 *  - Results list with a 40px face-crop thumb + name + category, an Add
 *    affordance per row.
 *  - Already-selected ids are excluded so a talent cannot be added twice.
 *  - `onAdd(item)` is the only side-effect hook — the parent decides what
 *    adding means (write to the inquiry cart, patch the inquiry, etc.).
 *
 * House rules: no hardcoded gold (neutral ink/white only here), no em dashes,
 * "client" never "buyer".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { RosterLiteItem } from "./InquiryDrawer";

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F7F2",
} as const;

/** Debounce window for roster filtering, per §4.B.3. */
const SEARCH_DEBOUNCE_MS = 250;

export type SearchTalentFieldProps = {
  /** Roster to search. Lite shape shared with the InquiryDrawer talent picker. */
  roster: RosterLiteItem[];
  /** Ids already on the inquiry — excluded from results so no double-add. */
  selectedIds: string[];
  /** Called when the user adds a result. Parent owns the actual side-effect. */
  onAdd: (item: RosterLiteItem) => void;
  /** Optional placeholder override. */
  placeholder?: string;
};

export function SearchTalentField({
  roster,
  selectedIds,
  onAdd,
  placeholder = "Search talent by name",
}: SearchTalentFieldProps) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the typed value into `query`, which actually drives filtering.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setQuery(draft), SEARCH_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster
      .filter((r) => !selected.has(r.id))
      .filter((r) => {
        if (!q) return true;
        const haystack = [r.name, r.primaryTypeLabel, r.city]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
  }, [roster, selected, query]);

  const hasQuery = query.trim().length > 0;

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ position: "relative" }}>
        {/* Leading magnifier */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            display: "inline-flex",
            color: C.inkDim,
            pointerEvents: "none",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: 44,
            padding: "0 12px 0 34px",
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            fontFamily: FONT,
            fontSize: 13.5,
            color: C.ink,
            background: C.surface,
            outline: "none",
          }}
        />
      </div>

      {results.length > 0 ? (
        <ul
          role="list"
          style={{
            margin: "6px 0 0",
            padding: "4px 0",
            listStyle: "none",
            maxHeight: 220,
            overflowY: "auto",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            background: C.surface,
          }}
        >
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onAdd(r)}
                aria-label={`Add ${r.name} to your inquiry`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  minHeight: 48,
                  padding: "6px 10px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: FONT,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceAlt)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  style={{
                    position: "relative",
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: C.surfaceAlt,
                  }}
                >
                  {r.photoUrl ? (
                    <Image
                      src={r.photoUrl}
                      alt={r.name}
                      fill
                      sizes="40px"
                      style={{ objectFit: "cover", objectPosition: "50% 20%" }}
                    />
                  ) : (
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: C.inkDim,
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                      </svg>
                    </span>
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: C.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.name}
                  </span>
                  {(r.primaryTypeLabel || r.city) && (
                    <span
                      style={{
                        display: "block",
                        fontSize: 11.5,
                        color: C.inkMuted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {[r.primaryTypeLabel, r.city].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: C.inkMuted,
                  }}
                >
                  Add
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        hasQuery && (
          <div
            style={{
              margin: "6px 0 0",
              padding: "10px 12px",
              fontSize: 12,
              color: C.inkMuted,
              lineHeight: 1.45,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              background: C.surface,
            }}
          >
            No talent match that name. Try another, or let the agency recommend.
          </div>
        )
      )}
    </div>
  );
}
