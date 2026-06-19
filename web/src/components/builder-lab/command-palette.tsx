"use client";

/**
 * LabCommandPalette (O6) — a Cmd/Ctrl-K command palette scoped to the Builder
 * Lab's Component Catalog. It indexes EVERY governed object the Catalog
 * controls — `+`-gallery components (built-in code ∪ template-backed), the
 * `builder_templates` rows, and the Playground drafts — and lets the operator
 * jump to any one in a single keystroke, landing on the owning tab with the row
 * pre-expanded.
 *
 * Contained + Lab-local on purpose: the edit-chrome CommandPalette is wired to
 * the live builder's EditContext (sections/drawers/undo), none of which exist
 * here. The pure index/fuzzy-match/group-by-source logic lives in
 * `command-search.ts`; this file is just the overlay + keyboard shell.
 *
 * Lifecycle: the ⌘K / Ctrl-K keydown listener is mounted by ComponentCatalog
 * (so it only fires while the Lab catalog is on screen) and torn down on
 * unmount. On select the palette calls `onJump(tab, rowId)` and the catalog
 * sets its active view + expands the matching row.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildCommandIndex,
  flattenGroups,
  groupBySource,
  searchCommandIndex,
  type CommandGroup,
  type IndexComponentInput,
  type IndexTemplateInput,
  type RankedCommandEntry,
} from "./command-search";
import { LAB as T, RADII } from "./ui";

/** True when the event is the platform palette chord (⌘K on macOS, Ctrl-K
 *  elsewhere). Exported so the catalog's listener and any test agree on it. */
export function isPaletteChord(e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  if (k !== "k") return false;
  return e.metaKey || e.ctrlKey;
}

export function LabCommandPalette({
  open,
  onClose,
  components,
  templates,
  drafts,
  templateTab,
  playgroundTab,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  components: ReadonlyArray<IndexComponentInput>;
  templates: ReadonlyArray<IndexTemplateInput>;
  drafts: ReadonlyArray<IndexTemplateInput>;
  templateTab: string;
  playgroundTab: string;
  /** Jump to a catalog view + expand a row. */
  onJump: (tab: string, rowId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () =>
      buildCommandIndex({
        components,
        templates,
        drafts,
        templateTab,
        playgroundTab,
      }),
    [components, templates, drafts, templateTab, playgroundTab],
  );

  const groups: CommandGroup[] = useMemo(
    () => groupBySource(searchCommandIndex(index, query)),
    [index, query],
  );
  const flat: RankedCommandEntry[] = useMemo(() => flattenGroups(groups), [groups]);

  // Reset query + focus the input each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    // Defer focus to after the overlay paints.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Keep the active index in range as results change.
  useEffect(() => {
    setActiveIdx((i) => (flat.length === 0 ? 0 : Math.min(i, flat.length - 1)));
  }, [flat.length]);

  if (!open) return null;

  const select = (entry: RankedCommandEntry | undefined) => {
    if (!entry) return;
    onJump(entry.tab, entry.rowId);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      select(flat[activeIdx]);
    }
  };

  // Flat running index so each rendered row can know if it's the active one
  // across group boundaries (keyboard nav walks the flattened list).
  let runningIdx = -1;

  return (
    <div
      role="presentation"
      data-testid="lab-command-palette"
      onMouseDown={(e) => {
        // Click on the backdrop (not the card) closes.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search the catalog"
        onKeyDown={onKeyDown}
        style={{
          width: 640,
          maxWidth: "92vw",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          background: T.card,
          border: `1px solid ${T.border}`,
          borderRadius: RADII.card,
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 12, borderBottom: `1px solid ${T.borderSoft}` }}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Search components, templates, and drafts…"
            aria-label="Search the catalog"
            data-testid="lab-command-input"
            className="focus-visible:outline-none"
            style={{
              width: "100%",
              background: T.field,
              border: `1px solid ${T.border}`,
              borderRadius: RADII.control,
              color: T.ink,
              fontSize: 14,
              padding: "10px 12px",
              outline: "none",
            }}
          />
        </div>

        <div ref={listRef} style={{ overflowY: "auto", padding: 6 }}>
          {flat.length === 0 ? (
            <div
              style={{
                color: T.inkMuted,
                fontSize: 13,
                padding: "18px 12px",
                textAlign: "center",
              }}
            >
              No matches{query ? ` for “${query}”` : ""}.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.source} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: T.inkDim,
                    padding: "8px 10px 4px",
                  }}
                >
                  {group.label}{" "}
                  <span style={{ color: T.inkDim, fontWeight: 600 }}>
                    ({group.entries.length})
                  </span>
                </div>
                {group.entries.map((entry) => {
                  runningIdx += 1;
                  const active = runningIdx === activeIdx;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-testid="lab-command-result"
                      onMouseMove={() => setActiveIdx(flat.indexOf(entry))}
                      onClick={() => select(entry)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        background: active ? T.accentBg : "transparent",
                        border: "none",
                        borderRadius: RADII.control,
                        padding: "9px 10px",
                        cursor: "pointer",
                        color: T.ink,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13.5,
                            fontWeight: 600,
                            color: active ? T.accent : T.ink,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entry.title}
                        </div>
                        {entry.subtitle ? (
                          <div
                            style={{
                              fontSize: 11,
                              color: T.inkDim,
                              marginTop: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {entry.subtitle}
                          </div>
                        ) : null}
                      </div>
                      <span
                        aria-hidden
                        style={{ color: T.inkDim, fontSize: 13, flexShrink: 0 }}
                      >
                        ↵
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            padding: "8px 12px",
            borderTop: `1px solid ${T.borderSoft}`,
            fontSize: 10.5,
            color: T.inkDim,
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ jump</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

/** Convenience re-export so the catalog imports the input slice types from one
 *  place alongside the component. */
export type { IndexComponentInput, IndexTemplateInput };
