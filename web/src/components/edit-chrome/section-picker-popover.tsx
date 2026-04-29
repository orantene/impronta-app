"use client";

/**
 * SectionPickerPopover — Sprint 3 navigator/library merge surface.
 *
 * Replaces the full-page composition library overlay for the most common
 * insertion path: clicking an inline `+` between sections. Anchored at the
 * click coordinates, scoped to the slot's allowed section types, fits in
 * a 320 px popover instead of the 720 px modal drawer.
 *
 * The audit complaint Sprint 3 closes:
 *
 *   "A modal for adding sections breaks flow. Premium builders use a
 *    slide-in panel from the canvas edge, or a + insertion point that
 *    opens a contextual mini-picker right where the section will land."
 *
 * The flow:
 *
 *   - operator clicks inline `+` in the canvas overlay (composition-
 *     inserter) → `openPickerPopover(target, x, y)` runs;
 *   - popover renders anchored under (or above, when clamped) the `+`,
 *     showing the curated default-tier section types for that slot;
 *   - operator clicks a type → `insertSection(target, typeKey)` runs the
 *     same CAS-safe create flow the modal used; popover closes on success;
 *   - "Browse all sections…" link at the bottom opens the existing
 *     `<CompositionLibraryOverlay />` for search + advanced + discovery.
 *
 * Sprint 3 scope keeps this minimal: no wireframe previews on tiles
 * (compact list with type icon + name + description), no category tabs
 * (one slot's allowed types fits in the popover), no advanced toggle.
 * The full library is still one click away.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEditContext } from "./edit-context";
import { CHROME, SectionTypeIcon } from "./kit";
import { getSuggestedSections } from "@/lib/site-admin/smart-section-recommendations";

const POPOVER_WIDTH = 340;
const POPOVER_MAX_HEIGHT = 460;
const VIEWPORT_MARGIN = 12;

export function SectionPickerPopover() {
  const {
    pickerPopover,
    closePickerPopover,
    openLibrary,
    slotDefs,
    slots,
    library,
    insertSection,
  } = useEditContext();
  const popRef = useRef<HTMLDivElement | null>(null);
  const [busyTypeKey, setBusyTypeKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalEl(document.body);
  }, []);

  // Reset transient state on every open.
  useEffect(() => {
    setBusyTypeKey(null);
    setError(null);
  }, [pickerPopover]);

  // Close on Escape.
  useEffect(() => {
    if (!pickerPopover) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePickerPopover();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerPopover, closePickerPopover]);

  // Outside-click close.
  useEffect(() => {
    if (!pickerPopover) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-section-picker-popover]")) {
        closePickerPopover();
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerPopover, closePickerPopover]);

  // Slot context — what types this slot accepts.
  const slotDef = useMemo(() => {
    if (!pickerPopover) return null;
    return slotDefs.find((s) => s.key === pickerPopover.target.slotKey) ?? null;
  }, [pickerPopover, slotDefs]);

  const items = useMemo(() => {
    if (!pickerPopover) return [];
    const allowed = slotDef?.allowedSectionTypes
      ? new Set(slotDef.allowedSectionTypes)
      : null;
    return library.filter((entry) => {
      if (!entry.inDefault) return false;
      if (allowed && !allowed.has(entry.typeKey)) return false;
      return true;
    });
  }, [pickerPopover, slotDef, library]);

  // Sprint 4 — smart recommendations. Given the section types already
  // on the page, surface up to 3 likely-next picks at the top of the
  // popover. Falls back gracefully when the page is empty (suggests
  // hero) or when the slot's allow-list excludes all suggestions.
  const suggested = useMemo(() => {
    if (!pickerPopover) return [];
    const currentTypes: string[] = [];
    for (const entries of Object.values(slots)) {
      for (const e of entries) currentTypes.push(e.sectionTypeKey);
    }
    const allowed = slotDef?.allowedSectionTypes
      ? new Set(slotDef.allowedSectionTypes)
      : null;
    const suggestions = getSuggestedSections(currentTypes, 3);
    // Map suggested type keys → library entries (so we render the
    // same icon + label + description as the full list). Drop any
    // that aren't in `items` (e.g., not in the slot's allow-list, or
    // not a default-library entry).
    const itemsByKey = new Map(items.map((it) => [it.typeKey, it]));
    return suggestions
      .map((typeKey) => itemsByKey.get(typeKey))
      .filter((entry): entry is NonNullable<typeof entry> => {
        if (!entry) return false;
        if (allowed && !allowed.has(entry.typeKey)) return false;
        return true;
      });
  }, [pickerPopover, slots, items, slotDef]);

  // Suggested-type keys for de-duplicating the "All sections" group
  // below. We don't want a section to appear twice in the same picker.
  const suggestedTypeKeys = useMemo(
    () => new Set(suggested.map((s) => s.typeKey)),
    [suggested],
  );

  // Position: prefer below the trigger, flip above when clamped, clamp
  // horizontally to the viewport.
  useLayoutEffect(() => {
    if (!pickerPopover || !popRef.current) {
      setPos(null);
      return;
    }
    const w = POPOVER_WIDTH;
    const h = Math.min(POPOVER_MAX_HEIGHT, popRef.current.offsetHeight || 320);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = pickerPopover.x - w / 2;
    let top = pickerPopover.y + 12;
    // Horizontal clamp.
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + w > vw - VIEWPORT_MARGIN) left = vw - w - VIEWPORT_MARGIN;
    // Vertical flip if not enough room below.
    if (top + h > vh - VIEWPORT_MARGIN) {
      const above = pickerPopover.y - h - 12;
      top = above >= VIEWPORT_MARGIN ? above : VIEWPORT_MARGIN;
    }
    setPos({ top, left });
  }, [pickerPopover, items.length]);

  if (!portalEl || !pickerPopover) return null;

  async function handlePick(typeKey: string) {
    if (!pickerPopover) return;
    setBusyTypeKey(typeKey);
    setError(null);
    const res = await insertSection(pickerPopover.target, typeKey);
    setBusyTypeKey(null);
    if (!res.ok) {
      setError(res.error ?? "Couldn't add the section.");
      return;
    }
    closePickerPopover();
  }

  function handleBrowseAll() {
    if (!pickerPopover) return;
    const target = pickerPopover.target;
    closePickerPopover();
    openLibrary(target);
  }

  return createPortal(
    <div
      ref={popRef}
      data-section-picker-popover
      role="dialog"
      aria-label="Add a section"
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: 12,
        boxShadow:
          "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
        display: "flex",
        flexDirection: "column",
        zIndex: 130,
        opacity: pos ? 1 : 0,
        transition: "opacity 100ms ease-out",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px 10px",
          borderBottom: `1px solid ${CHROME.line}`,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: CHROME.ink,
            letterSpacing: "-0.01em",
          }}
        >
          Add a section
        </div>
        {slotDef ? (
          <div
            style={{
              fontSize: 11.5,
              color: CHROME.muted,
              marginTop: 2,
            }}
          >
            Inserting into {slotDef.label}
          </div>
        ) : null}
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 6,
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              fontSize: 12,
              color: CHROME.muted,
            }}
          >
            No section types available for this slot.
          </div>
        ) : (
          <>
            {/* Sprint 4 — Suggested group. Hidden when no suggestions
             *  resolve (rare — only when the slot's allow-list excludes
             *  every recommendation). Heuristic lives in
             *  smart-section-recommendations.ts; this surface only
             *  renders the result. */}
            {suggested.length > 0 ? (
              <>
                <div
                  style={{
                    padding: "8px 12px 4px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: CHROME.muted,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    style={{ color: CHROME.amber }}
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Suggested
                </div>
                {suggested.map((entry) => {
                  const isBusy = busyTypeKey === entry.typeKey;
                  return (
                    <button
                      key={`sug-${entry.typeKey}`}
                      type="button"
                      disabled={busyTypeKey !== null}
                      onClick={() => void handlePick(entry.typeKey)}
                      className="cursor-pointer"
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        width: "100%",
                        padding: "10px 10px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 8,
                        textAlign: "left",
                        transition: "background 120ms",
                        opacity: busyTypeKey && !isBusy ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          CHROME.paper2;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "transparent";
                      }}
                    >
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 7,
                          background: "rgba(180, 83, 9, 0.10)",
                          color: CHROME.amber,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                        aria-hidden
                      >
                        <SectionTypeIcon typeKey={entry.typeKey} size={16} />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            color: CHROME.ink,
                            letterSpacing: "-0.005em",
                          }}
                        >
                          {entry.label}
                          {isBusy ? (
                            <span
                              style={{ fontSize: 11, fontWeight: 500, color: CHROME.muted }}
                            >
                              adding…
                            </span>
                          ) : null}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 11.5,
                            color: CHROME.muted,
                            marginTop: 1,
                            lineHeight: 1.4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entry.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
                <div
                  aria-hidden
                  style={{
                    height: 1,
                    background: CHROME.line,
                    margin: "6px 6px",
                  }}
                />
                <div
                  style={{
                    padding: "4px 12px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: CHROME.muted,
                  }}
                >
                  All sections
                </div>
              </>
            ) : null}
            {items
              .filter((entry) => !suggestedTypeKeys.has(entry.typeKey))
              .map((entry) => {
            const isBusy = busyTypeKey === entry.typeKey;
            return (
              <button
                key={entry.typeKey}
                type="button"
                disabled={busyTypeKey !== null}
                onClick={() => void handlePick(entry.typeKey)}
                className="cursor-pointer"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  width: "100%",
                  padding: "10px 10px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 8,
                  textAlign: "left",
                  transition: "background 120ms",
                  opacity: busyTypeKey && !isBusy ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    CHROME.paper2;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 7,
                    background: CHROME.paper2,
                    color: CHROME.ink,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  <SectionTypeIcon typeKey={entry.typeKey} size={16} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      color: CHROME.ink,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {entry.label}
                    {isBusy ? (
                      <span
                        style={{ fontSize: 11, fontWeight: 500, color: CHROME.muted }}
                      >
                        adding…
                      </span>
                    ) : null}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      color: CHROME.muted,
                      marginTop: 1,
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.description}
                  </span>
                </span>
              </button>
            );
          })}
          </>
        )}
      </div>

      {/* Footer — Browse all link */}
      <div
        style={{
          borderTop: `1px solid ${CHROME.line}`,
          padding: 8,
        }}
      >
        {error ? (
          <div
            style={{
              fontSize: 11.5,
              color: CHROME.amber,
              marginBottom: 6,
              padding: "0 6px",
            }}
          >
            {error}
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleBrowseAll}
          className="cursor-pointer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "8px 10px",
            background: "transparent",
            border: "none",
            borderRadius: 6,
            color: CHROME.text,
            fontSize: 12,
            fontWeight: 500,
            transition: "background 120ms",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = CHROME.paper2;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <span>Browse all sections…</span>
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke={CHROME.muted}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>,
    portalEl,
  );
}
