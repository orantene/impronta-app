"use client";

/**
 * NavigatorPanel — left-rail Structure Navigator (Phase 3).
 *
 * Implements builder-experience.html surface §11 (Structure navigator).
 * Last reconciled: 2026-04-25.
 *
 * Same role every premium builder ships: Webflow's Navigator, Framer's
 * Layers panel, Figma's Layers list. A 280px-wide left rail that shows
 * every section in document order with a section-type icon, name,
 * visibility toggle, and a drag handle. Click selects. Drag reorders.
 * `⌘\` toggles visibility.
 *
 * Visual spec: surface 11 of `docs/mockups/builder-experience.html`.
 *
 * Wires
 *   - Reads slots from EditContext, flattens them in slot-def order.
 *   - Selecting a row → `setSelectedSectionId` (matches canvas selection).
 *   - Drag-reorder → `moveSectionTo` (existing CAS-safe action).
 *   - Footer Settings button → `openPageSettings`.
 *   - Footer Theme button → `openTheme` (Phase 5 ThemeDrawer).
 *
 * Visibility toggle:
 *   Wires through `setSectionVisibility(sectionId, "hidden" | "always")`
 *   which round-trips `presentation.visibility` on the section's props
 *   via `setSectionVisibilityAction` (CAS-safe, audited, cache-busts the
 *   storefront). `presentation.visibility` already maps to
 *   `data-section-visibility` via `presentationDataAttrs` and the
 *   storefront's `token-presets.css`, so a click here propagates to the
 *   live preview without any per-section render changes.
 *
 *   The schema's `desktop-only`/`mobile-only` granularity is not yet
 *   exposed in the navigator (the eye is a binary toggle); a follow-up
 *   right-click menu will surface the full enum.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  SectionTypeIcon,
} from "./kit";

import type {
  CompositionSectionRef,
  CompositionSlotDef,
} from "@/lib/site-admin/edit-mode/composition-actions";
import { cleanSectionName } from "@/lib/site-admin/clean-section-name";
import { sectionDisplayName } from "@/lib/site-admin/section-display-name";
import type { SectionVisibility as SectionVisibilityT } from "@/lib/site-admin/edit-mode/section-actions";

import { useEditContext } from "./edit-context";
import { HeadingLintBadge } from "./inspectors/HeadingLintBadge";
import { loadHeadingProbeForLint } from "@/lib/site-admin/edit-mode/heading-lint-action";
import {
  buildHeadingOutline,
  buildStructuralHeadingOutline,
  lintHeadingOutline,
} from "@/lib/site-admin/a11y/heading-hierarchy";

const PANEL_WIDTH = 280;

interface FlatRow {
  ref: CompositionSectionRef;
  slotKey: string;
  /** Index of this row inside its slot's array (used by `moveSectionTo`). */
  slotIndex: number;
  /** Position across the whole flattened list (drop targets use this). */
  flatIndex: number;
}

export function NavigatorPanel() {
  const {
    selectedSectionId,
    setSelectedSectionId,
    slots,
    slotDefs,
    pageMetadata,
    moveSectionTo,
    openPageSettings,
    openTheme,
    navigatorOpen,
    toggleNavigator,
    setSectionVisibility,
  } = useEditContext();

  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Phase B.2.C — shell sections (header / footer) live on a different
  // page row than the homepage, so they're not in the EditProvider's
  // `slots` state. But when the snapshot shell is engaged, they ARE
  // rendered on the canvas with the canonical [data-cms-section]
  // wrappers. Detect them here so the Navigator has a fallback path to
  // select header/footer (the canvas-click path is also restored in
  // composition-inserter B.2.C, but the Navigator should always list
  // every selectable section regardless of canvas hit-test edge cases).
  //
  // Re-query on every navigator open + on MutationObserver so a publish
  // that swaps shell sections doesn't leave stale entries.
  interface ShellNavRow {
    sectionId: string;
    sectionTypeKey: "site_header" | "site_footer";
    slotKey: "header" | "footer";
    label: string;
  }
  const [shellRows, setShellRows] = useState<ShellNavRow[]>([]);
  useEffect(() => {
    if (!navigatorOpen) return;
    const recompute = () => {
      const out: ShellNavRow[] = [];
      const headers = document.querySelectorAll<HTMLElement>(
        '[data-cms-section][data-section-type-key="site_header"]',
      );
      headers.forEach((el) => {
        const id = el.getAttribute("data-section-id");
        if (id) out.push({ sectionId: id, sectionTypeKey: "site_header", slotKey: "header", label: "Site header" });
      });
      const footers = document.querySelectorAll<HTMLElement>(
        '[data-cms-section][data-section-type-key="site_footer"]',
      );
      footers.forEach((el) => {
        const id = el.getAttribute("data-section-id");
        if (id) out.push({ sectionId: id, sectionTypeKey: "site_footer", slotKey: "footer", label: "Site footer" });
      });
      setShellRows(out);
    };
    recompute();
    const mo = new MutationObserver(() => recompute());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [navigatorOpen]);
  /** Flat-index of the current drop-line target (insert *before* this row). null → no drop visible. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dropEdgeRef = useRef<"top" | "bottom">("top");

  const flat = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    let flatIndex = 0;
    const order = slotDefsOrder(slotDefs, slots);
    for (const slotKey of order) {
      const entries = slots[slotKey] ?? [];
      const sorted = [...entries].sort((a, b) => a.sortOrder - b.sortOrder);
      sorted.forEach((ref, slotIndex) => {
        out.push({ ref, slotKey, slotIndex, flatIndex: flatIndex++ });
      });
    }
    return out;
  }, [slotDefs, slots]);

  // Phase 10 — heading hierarchy lint. Two modes:
  //   - Structural (default, instant): infers from section types alone.
  //   - Props-aware (after lazy fetch): fills in actual headline text so
  //     sections with empty headlines drop OUT of the outline (preventing
  //     false "skipped level" warnings from configured-but-empty sections).
  // The fetch fires once when the navigator opens and re-fires when the
  // section list changes shape (id set diff).
  //
  // QA-2 reuse — the same probe is now also the source for content-
  // derived display names below. One round-trip serves both lint and
  // navigator labels; no extra fetch added.
  const [headingProbe, setHeadingProbe] = useState<
    Record<string, string> | null
  >(null);
  const flatIdsKey = flat.map((r) => r.ref.sectionId).sort().join(",");
  useEffect(() => {
    let cancelled = false;
    if (!navigatorOpen || flat.length === 0) return;
    void (async () => {
      const result = await loadHeadingProbeForLint();
      if (cancelled || !result.ok) return;
      const map: Record<string, string> = {};
      for (const s of result.sections) map[s.sectionId] = s.headlineText;
      setHeadingProbe(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigatorOpen, flatIdsKey, flat.length]);

  // QA-4 fix — when two sections share the same display name (e.g. homepage
  // with two `cta_banner` sections both seeded as "Final CTA — new"), the
  // navigator used to render two rows with identical labels and no way to
  // tell them apart while reordering. We pre-compute a sectionId →
  // disambiguated label map: the first occurrence keeps the bare name,
  // every later occurrence gains a "(N)" tail (count of prior occurrences).
  // This is a display-only treatment; nothing else in the system uses these
  // labels for identity.
  //
  // QA-2 fix — the same memo also folds in `headingProbe` (loaded
  // asynchronously above). When a section has a substantive headline like
  // "A short list, always on call.", we surface that as the navigator label
  // instead of the seeder default ("Featured professionals — new"). Operators
  // identify sections visually by their headline, so the editor's name should
  // match. Sections without a headline (site_header, marquee, etc.) keep the
  // cleanSectionName fallback. The disambiguator runs AFTER resolution so
  // two sections with identical headlines still get "(2)" / "(3)".
  const displayNameById = useMemo(() => {
    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    for (const row of flat) {
      const base = sectionDisplayName({
        typeKey: row.ref.sectionTypeKey,
        rawName: row.ref.name,
        headline: headingProbe?.[row.ref.sectionId] ?? null,
      });
      const seen = counts.get(base) ?? 0;
      counts.set(base, seen + 1);
      labels.set(row.ref.sectionId, seen === 0 ? base : `${base} (${seen + 1})`);
    }
    return labels;
  }, [flat, headingProbe]);
  const labelFor = useCallback(
    (row: FlatRow) =>
      displayNameById.get(row.ref.sectionId) ??
      sectionDisplayName({
        typeKey: row.ref.sectionTypeKey,
        rawName: row.ref.name,
      }),
    [displayNameById],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((r) => {
      // T2-2 — search the cleaned display name, not the raw seeder string.
      // Otherwise queries for "Classic starter" would match every starter
      // section, polluting results with operator-invisible boilerplate.
      //
      // QA-2 follow-on — content-derived display names mean the visible
      // label can be a headline string. We search across BOTH the
      // headline AND the cleaned stored name so an operator hunting for
      // "Featured talent" still matches a section the navigator is
      // labelling as "A short list, always on call." Otherwise the
      // search bar would silently miss sections by type/intent label.
      const cleanedName = (
        cleanSectionName(r.ref.name) || r.ref.name
      ).toLowerCase();
      const probedHeadline = (
        displayNameById.get(r.ref.sectionId) ?? ""
      ).toLowerCase();
      return (
        cleanedName.includes(q) ||
        probedHeadline.includes(q) ||
        r.ref.sectionTypeKey.toLowerCase().includes(q)
      );
    });
  }, [flat, search, displayNameById]);

  const headingIssues = useMemo(() => {
    const flatLite = flat.map((r) => ({
      sectionId: r.ref.sectionId,
      sectionTypeKey: r.ref.sectionTypeKey,
    }));
    if (headingProbe) {
      // Props-aware: feed the loaded headline back in via a synthetic
      // SectionLike payload that buildHeadingOutline can consume.
      const propBased = flatLite.map((s) => ({
        ...s,
        props: { headline: headingProbe[s.sectionId] ?? "", eyebrow: headingProbe[s.sectionId] ?? "" },
      }));
      return lintHeadingOutline(buildHeadingOutline(propBased));
    }
    return lintHeadingOutline(buildStructuralHeadingOutline(flatLite));
  }, [flat, headingProbe]);

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, sectionId: string) => {
      setDraggingId(sectionId);
      // QA-6 fix — promote the dragged row to selection so the inspector,
      // canvas chip, and navigator all agree on the active section. The
      // chip's startDrag (selection-layer.tsx) already does this; the
      // navigator's drag handler used to leave selection bound to whatever
      // the operator clicked last, so dragging Hero while Site header was
      // selected left the inspector stuck on Site header even as Hero
      // visually became the active drag source.
      setSelectedSectionId(sectionId);
      e.dataTransfer.effectAllowed = "move";
      // We ignore dataTransfer payload — id is in component state — but
      // setting *something* keeps Firefox from cancelling the drag.
      e.dataTransfer.setData("text/plain", sectionId);
    },
    [setSelectedSectionId],
  );

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropAt(null);
  }, []);

  const onRowDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, targetFlatIndex: number) => {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const onUpperHalf = e.clientY - rect.top < rect.height / 2;
      dropEdgeRef.current = onUpperHalf ? "top" : "bottom";
      setDropAt(onUpperHalf ? targetFlatIndex : targetFlatIndex + 1);
    },
    [draggingId],
  );

  const onDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      if (!draggingId || dropAt == null) return;
      e.preventDefault();
      const moved = flat.find((r) => r.ref.sectionId === draggingId);
      if (!moved) {
        onDragEnd();
        return;
      }
      // dropAt is the post-removal flat-index where the row should land.
      // To translate into (slotKey, slotIndex) we walk the slot order
      // counting visible rows in each slot until we hit dropAt.
      const order = slotDefsOrder(slotDefs, slots);
      let consumed = 0;
      let targetSlotKey = order[order.length - 1] ?? moved.slotKey;
      let targetSlotIndex = 0;
      for (const slotKey of order) {
        let count = (slots[slotKey] ?? []).length;
        // Removing the dragged row from its source slot reduces that
        // slot's count by one when computing destination indices.
        if (slotKey === moved.slotKey) count -= 1;
        if (consumed + count >= dropAt) {
          targetSlotKey = slotKey;
          targetSlotIndex = dropAt - consumed;
          break;
        }
        consumed += count;
      }
      // No-op when the drop position equals the source position.
      if (
        targetSlotKey === moved.slotKey &&
        (targetSlotIndex === moved.slotIndex ||
          targetSlotIndex === moved.slotIndex + 1)
      ) {
        onDragEnd();
        return;
      }
      onDragEnd();
      await moveSectionTo(moved.ref.sectionId, targetSlotKey, targetSlotIndex);
    },
    [draggingId, dropAt, flat, slots, slotDefs, moveSectionTo, onDragEnd],
  );

  if (!navigatorOpen) {
    // Collapsed "rail handle" — a 24px-wide tab on the left edge that
    // restores the panel. Mirrors how the inspector's drawer-tools
    // close button works on the right side.
    return (
      <button
        type="button"
        data-edit-overlay="navigator-rail-handle"
        onClick={toggleNavigator}
        title="Show Structure Navigator (⌘\\)"
        aria-label="Show Structure Navigator"
        style={{
          position: "fixed",
          left: 0,
          top: 54,
          bottom: 0,
          width: 22,
          borderRight: `1px solid ${CHROME.line}`,
          background: CHROME.paper,
          color: CHROME.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 80,
          cursor: "pointer",
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
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    );
  }

  return (
    <aside
      data-edit-overlay="navigator-panel"
      style={{
        position: "fixed",
        left: 0,
        top: 54,
        bottom: 0,
        width: PANEL_WIDTH,
        background: CHROME.paper2,
        borderRight: `1px solid ${CHROME.line}`,
        boxShadow: `1px 0 0 ${CHROME.line}, 16px 0 32px -16px rgba(0,0,0,0.10)`,
        display: "flex",
        flexDirection: "column",
        zIndex: 80,
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the panel as a whole, not when moving
        // between rows inside it.
        const target = e.relatedTarget as Node | null;
        if (!target || !e.currentTarget.contains(target)) {
          setDropAt(null);
        }
      }}
      onDrop={onDrop}
      onDragOver={(e) => {
        if (draggingId) e.preventDefault();
      }}
    >
      {/* Header — eyebrow + search + collapse */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${CHROME.line}`,
          background: CHROME.surface,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: CHROME.muted,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: 999,
                background: CHROME.green,
              }}
            />
            Navigator
          </div>
          <button
            type="button"
            onClick={toggleNavigator}
            title="Hide Structure Navigator (⌘\\)"
            aria-label="Hide Structure Navigator"
            style={{
              width: 22,
              height: 22,
              borderRadius: CHROME_RADII.sm,
              border: "none",
              background: "transparent",
              color: CHROME.muted,
              cursor: "pointer",
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
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <div style={{ position: "relative" }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              transform: "translateY(-50%)",
              color: CHROME.muted2,
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sections…"
            style={{
              width: "100%",
              padding: "6px 8px 6px 28px",
              fontSize: 11.5,
              fontFamily: "inherit",
              background: CHROME.paper,
              border: `1px solid ${CHROME.line}`,
              borderRadius: CHROME_RADII.sm,
              color: CHROME.text,
              outline: "none",
              boxShadow: CHROME_SHADOWS.inputInset,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = CHROME.blue;
              e.currentTarget.style.boxShadow = `${CHROME_SHADOWS.inputInset}, ${CHROME_SHADOWS.inputFocus}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = CHROME.line;
              e.currentTarget.style.boxShadow = CHROME_SHADOWS.inputInset;
            }}
          />
        </div>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
        {/* Phase B.2.C — Site shell group. Renders above the page root
         *  whenever the snapshot shell is engaged (shellRows non-empty).
         *  Selecting a row here behaves identically to clicking the
         *  rendered header/footer on the canvas — same setSelectedSectionId,
         *  same downstream inspector + save flow. No special shell mental
         *  model. */}
        {shellRows.length > 0 ? (
          <div style={{ marginBottom: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                borderRadius: CHROME_RADII.sm,
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: CHROME.muted,
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Site shell</span>
              <span
                style={{
                  color: CHROME.muted2,
                  fontWeight: 500,
                  letterSpacing: 0,
                  textTransform: "none",
                }}
              >
                · header + footer
              </span>
            </div>
            <div
              style={{
                marginLeft: 8,
                borderLeft: `1px solid ${CHROME.line}`,
                paddingLeft: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {shellRows.map((row) => {
                const selected = selectedSectionId === row.sectionId;
                return (
                  <div
                    key={row.sectionId}
                    onClick={() => setSelectedSectionId(row.sectionId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedSectionId(row.sectionId);
                      }
                    }}
                    title={row.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "6px 8px",
                      borderRadius: CHROME_RADII.sm,
                      // QA-9 follow-on — site shell rows (Site header / Site
                      // footer) used the same CHROME.ink the homepage rows
                      // had before; verification caught this when Site header
                      // selection rendered black-pill while Hero rendered
                      // slate-pill in the same navigator. Same slate now.
                      background: selected ? CHROME.accent : "transparent",
                      color: selected ? "#ffffff" : CHROME.text,
                      fontSize: 12,
                      fontWeight: selected ? 600 : 500,
                      cursor: "pointer",
                      transition: "background 80ms ease, color 80ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background =
                          "rgba(24,24,27,0.04)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <SectionTypeIcon
                      typeKey={row.sectionTypeKey}
                      size={13}
                      style={{
                        flexShrink: 0,
                        opacity: selected ? 0.85 : 0.65,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        letterSpacing: "-0.005em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Page root */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 8px",
            borderRadius: CHROME_RADII.sm,
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: CHROME.muted,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span>{pageMetadata?.title ?? "Page"}</span>
          <span
            style={{
              color: CHROME.muted2,
              fontWeight: 500,
              letterSpacing: 0,
              textTransform: "none",
            }}
          >
            · {flat.length} section{flat.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Phase 10 — heading hierarchy lint badge. */}
        {flat.length > 0 ? (
          <div style={{ padding: "4px 8px 8px" }}>
            <HeadingLintBadge
              issues={headingIssues}
              onFocusSection={(sectionId) =>
                setSelectedSectionId(sectionId)
              }
            />
          </div>
        ) : null}

        <div
          style={{
            marginLeft: 8,
            borderLeft: `1px solid ${CHROME.line}`,
            paddingLeft: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {visible.length === 0 && search.trim() && (
            <div
              style={{
                padding: "10px 8px",
                fontSize: 11.5,
                color: CHROME.muted2,
                fontStyle: "italic",
              }}
            >
              No sections match &ldquo;{search}&rdquo;.
            </div>
          )}
          {visible.length === 0 && !search.trim() && (
            <div
              style={{
                padding: "10px 8px",
                fontSize: 11.5,
                color: CHROME.muted2,
              }}
            >
              No sections yet.
            </div>
          )}
          {visible.map((row) => {
            const selected = selectedSectionId === row.ref.sectionId;
            const isDragging = draggingId === row.ref.sectionId;
            const showDropLineAbove =
              draggingId && dropAt === row.flatIndex && !isDragging;
            const showDropLineBelow =
              draggingId &&
              dropAt === row.flatIndex + 1 &&
              !isDragging &&
              row.flatIndex === visible[visible.length - 1]?.flatIndex;
            const visibility = row.ref.visibility ?? "always";
            const hidden = visibility === "hidden";

            return (
              <div key={row.ref.sectionId} style={{ position: "relative" }}>
                {showDropLineAbove && <DropLine />}
                <div
                  draggable
                  onDragStart={(e) => onDragStart(e, row.ref.sectionId)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => onRowDragOver(e, row.flatIndex)}
                  onClick={() => setSelectedSectionId(row.ref.sectionId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedSectionId(row.ref.sectionId);
                    }
                  }}
                  title={labelFor(row)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "6px 8px",
                    borderRadius: CHROME_RADII.sm,
                    // QA-9 partial — selected row uses the editor's slate
                    // accent so navigator selection matches the chip /
                    // Publish CTA family instead of brand-black ink.
                    background: selected ? CHROME.accent : "transparent",
                    color: selected ? "#ffffff" : hidden ? CHROME.muted2 : CHROME.text,
                    fontSize: 12,
                    fontWeight: selected ? 600 : 500,
                    cursor: "pointer",
                    opacity: isDragging ? 0.4 : hidden && !selected ? 0.6 : 1,
                    transition:
                      "background 80ms ease, color 80ms ease, opacity 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background =
                        "rgba(24,24,27,0.04)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <GripDots
                    color={selected ? "rgba(255,255,255,0.55)" : CHROME.muted2}
                  />
                  <SectionTypeIcon
                    typeKey={row.ref.sectionTypeKey}
                    size={13}
                    style={{
                      flexShrink: 0,
                      opacity: selected ? 0.85 : 0.65,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      letterSpacing: "-0.005em",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textDecoration: hidden ? "line-through" : "none",
                      textDecorationColor: CHROME.muted2,
                    }}
                  >
                    {labelFor(row)}
                  </span>
                  <VisibilityEye
                    selected={selected}
                    visibility={visibility}
                    onToggle={() => {
                      const next: SectionVisibilityT =
                        visibility === "hidden" ? "always" : "hidden";
                      void setSectionVisibility(row.ref.sectionId, next);
                    }}
                  />
                </div>
                {showDropLineBelow && <DropLine />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer — Page settings + Theme shortcuts */}
      <div
        style={{
          borderTop: `1px solid ${CHROME.line}`,
          padding: "10px 12px",
          background: CHROME.surface,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: CHROME.muted2,
            marginBottom: 6,
          }}
        >
          Page
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <FooterShortcut
            onClick={openPageSettings}
            title="Edit page title, SEO, social, URL"
          >
            Settings
          </FooterShortcut>
          <FooterShortcut onClick={openTheme} title="Edit colours, type, and spacing">
            Theme
          </FooterShortcut>
        </div>
      </div>
    </aside>
  );
}

function slotDefsOrder(
  slotDefs: CompositionSlotDef[],
  slots: Record<string, CompositionSectionRef[]>,
): string[] {
  // Prefer slotDefs ordering. Fall back to keys present in slots so we
  // never silently drop a section if a tenant has a slot the registry
  // doesn't know about (e.g. legacy data).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const def of slotDefs) {
    if (slots[def.key]) {
      out.push(def.key);
      seen.add(def.key);
    }
  }
  for (const key of Object.keys(slots)) {
    if (!seen.has(key)) out.push(key);
  }
  return out;
}

function GripDots({ color }: { color: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 9 14"
      fill={color}
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <circle cx="2" cy="2" r="1" />
      <circle cx="7" cy="2" r="1" />
      <circle cx="2" cy="7" r="1" />
      <circle cx="7" cy="7" r="1" />
      <circle cx="2" cy="12" r="1" />
      <circle cx="7" cy="12" r="1" />
    </svg>
  );
}

function VisibilityEye({
  selected,
  visibility,
  onToggle,
}: {
  selected: boolean;
  visibility: SectionVisibilityT;
  onToggle: () => void;
}) {
  const hidden = visibility === "hidden";
  const partial =
    visibility === "desktop-only" || visibility === "mobile-only";
  const titleText = hidden
    ? "Hidden on every breakpoint — click to show"
    : partial
      ? `Visible on ${visibility === "desktop-only" ? "desktop" : "mobile"} only`
      : "Visible everywhere — click to hide";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={titleText}
      aria-label={titleText}
      aria-pressed={hidden}
      style={{
        width: 18,
        height: 18,
        padding: 0,
        border: "none",
        background: "transparent",
        color: selected
          ? hidden
            ? "rgba(255,255,255,0.85)"
            : "rgba(255,255,255,0.65)"
          : hidden
            ? CHROME.amber
            : CHROME.muted2,
        cursor: "pointer",
        opacity: hidden ? 1 : 0.7,
      }}
    >
      {hidden ? (
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
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
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
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

function DropLine() {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        height: 0,
        margin: "1px 0",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -2,
          right: 4,
          top: -1,
          height: 2,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${CHROME.blue}, ${CHROME.blue})`,
          boxShadow: CHROME_SHADOWS.dropLine,
        }}
      />
    </div>
  );
}

function FooterShortcut({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        flex: 1,
        height: 26,
        padding: "0 8px",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        color: disabled ? CHROME.muted2 : CHROME.text,
        background: "transparent",
        border: `1px solid ${CHROME.line}`,
        borderRadius: CHROME_RADII.sm,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background 100ms ease, border-color 100ms ease",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = CHROME.paper;
          e.currentTarget.style.borderColor = CHROME.lineMid;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = CHROME.line;
        }
      }}
    >
      {children}
    </button>
  );
}
