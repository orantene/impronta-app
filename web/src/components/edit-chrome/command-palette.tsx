"use client";

/**
 * CommandPalette — Phase 8 of the builder.
 *
 * A `⌘K`-triggered overlay (Cmd on macOS, Ctrl elsewhere) that lets the
 * operator jump to anything in one keystroke: a section on the page, a
 * drawer (Publish / Page Settings / Revisions / Theme / Assets), an
 * editing action (undo / redo / save draft / duplicate), or a navigation
 * target (device switcher, navigator toggle).
 *
 * The palette is a centred modal — 640px wide, ink-tinted overlay
 * underneath, paper-tinted card body, search input that auto-focuses
 * on open, grouped result list, keyboard navigation (↑/↓/↵/Esc), and a
 * footer hint strip explaining the keybinds the operator just used to
 * land here.
 *
 * Result groups (in render order):
 *   1. Sections — every section currently in the homepage, listed by
 *      slot. Selecting a section runs `setSelectedSectionId` so the
 *      inspector engages it; if the navigator's open it follows along.
 *   2. Drawers — the five right-side drawers (Publish, Page Settings,
 *      Revisions, Theme, Assets). Selecting opens the drawer.
 *   3. Actions — undo, redo, save draft, duplicate selected, toggle
 *      navigator, switch device. Driven by the SHORTCUTS registry so
 *      Phase 10's overlay reads from the same source.
 *   4. Pages — multi-page is a Phase 24 schema deepening; today there's
 *      one page (Homepage), so this group is hidden when only one page
 *      exists. The component is forward-compatible: pass `pages` and
 *      they'll render.
 *
 * Search is fuzzy: characters in the query must appear in order in the
 * candidate string but don't have to be contiguous. A small ranking
 * favours contiguous matches + earlier-position matches + label
 * matches over keyword/synonym matches.
 *
 * Why keep the palette local-only (no server actions): every result the
 * palette dispatches is already routed through EditContext callbacks
 * that own their own server round-trip. The palette just chooses which
 * callback to run — it doesn't fetch state or save anything itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  KbdSequence,
  SectionTypeIcon,
  SHORTCUTS,
  type Shortcut,
} from "./kit";
import { useEditContext, type EditDevice } from "./edit-context";
import { createShareLinkAction } from "@/lib/site-admin/share-link/share-actions";

// ── public surface ──────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

// ── result row types ────────────────────────────────────────────────────

type ResultGroup =
  | "section"
  | "drawer"
  | "action"
  | "navigation"
  | "page";

interface ResultRow {
  /** Stable id for react keys + active highlight tracking. */
  id: string;
  group: ResultGroup;
  /** Primary display string. The first thing to scan. */
  label: string;
  /** Secondary context — slot name, drawer description, page url, etc. */
  meta?: string;
  /** Searchable extra terms (synonyms, type labels) hidden from view. */
  keywords?: ReadonlyArray<string>;
  /** Optional left-side glyph. */
  icon?: ReactNode;
  /** Optional shortcut chips rendered on the right. */
  shortcut?: Shortcut;
  /** What happens when the row is committed (Enter or click). */
  perform: () => void;
}

const GROUP_LABELS: Record<ResultGroup, string> = {
  section: "Sections",
  drawer: "Drawers",
  action: "Actions",
  navigation: "Navigation",
  page: "Pages",
};

const GROUP_ORDER: ReadonlyArray<ResultGroup> = [
  "section",
  "drawer",
  "action",
  "navigation",
  "page",
];

// ── fuzzy match scoring ─────────────────────────────────────────────────

/**
 * Returns a match score for `query` against `text`, or null when the
 * query characters don't all appear (in order, case-insensitive). Higher
 * scores are better. The scoring rewards:
 *   - shorter target strings (so "Hero" beats "Hero with overlay" at
 *     query="hero")
 *   - earlier first-match position
 *   - contiguous runs of matching characters
 *   - exact prefix matches
 */
function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q === t) return 10000;
  if (t.startsWith(q)) return 5000 - t.length;

  let qi = 0;
  let firstMatch = -1;
  let runs = 0;
  let lastIdx = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      if (firstMatch === -1) firstMatch = ti;
      if (ti === lastIdx + 1) runs += 1;
      lastIdx = ti;
      qi += 1;
    }
  }
  if (qi < q.length) return null;

  // Composite score. Magic numbers tuned by feel — the goal is for
  // operator-typed queries to land the obvious match at the top.
  return (
    1000 -
    firstMatch * 8 -
    (t.length - q.length) * 2 +
    runs * 25
  );
}

/** Score across label + meta + keywords; returns the best individual score. */
function scoreRow(query: string, row: ResultRow): number | null {
  if (!query) return 1;
  let best: number | null = null;
  const candidates = [row.label, row.meta ?? "", ...(row.keywords ?? [])];
  for (const c of candidates) {
    const s = fuzzyScore(query, c);
    if (s !== null && (best === null || s > best)) best = s;
  }
  // Demote keyword/meta-only matches slightly so a label match wins.
  const labelScore = fuzzyScore(query, row.label);
  if (labelScore !== null && best !== null && labelScore < best) {
    return Math.max(labelScore + 50, best - 100);
  }
  return best;
}

// ── component ───────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const ctx = useEditContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  // Reset search + selection every time the palette opens. An operator
  // expects a fresh slate when they hit ⌘K, not the last query.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // Defer focus so the input mounts before we ask for it.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Build the full row list every render — the list is small (< 50 rows
  // even with a heavily-loaded page) and the EditContext deps trigger
  // exactly when the underlying data changes.
  const allRows = useMemo<ResultRow[]>(() => {
    const rows: ResultRow[] = [];

    // Sections — flatten slots in their canonical order. Slot defs hold
    // the pretty label; fall back to slotKey when defs are missing.
    const slotLabelByKey = new Map<string, string>();
    for (const def of ctx.slotDefs) {
      slotLabelByKey.set(def.key, def.label ?? def.key);
    }
    for (const def of ctx.slotDefs) {
      const list = ctx.slots[def.key] ?? [];
      for (const ref of list) {
        rows.push({
          id: `section:${ref.sectionId}`,
          group: "section",
          label: ref.name,
          meta: slotLabelByKey.get(def.key) ?? def.key,
          keywords: [ref.sectionTypeKey, "section", "go to"],
          icon: (
            <SectionTypeIcon
              typeKey={ref.sectionTypeKey}
              size={14}
              style={{ color: CHROME.muted }}
            />
          ),
          perform: () => {
            ctx.setSelectedSectionId(ref.sectionId);
            // Scroll into view if it's mounted on the page.
            const el = document.querySelector(
              `[data-section-id="${ref.sectionId}"]`,
            );
            if (el && "scrollIntoView" in el) {
              (el as HTMLElement).scrollIntoView({
                block: "center",
                behavior: "smooth",
              });
            }
            onClose();
          },
        });
      }
    }
    // Catch sections in slots that aren't in slotDefs (defensive).
    for (const [slotKey, list] of Object.entries(ctx.slots)) {
      if (slotLabelByKey.has(slotKey)) continue;
      for (const ref of list) {
        rows.push({
          id: `section:${ref.sectionId}`,
          group: "section",
          label: ref.name,
          meta: slotKey,
          keywords: [ref.sectionTypeKey, "section"],
          icon: (
            <SectionTypeIcon
              typeKey={ref.sectionTypeKey}
              size={14}
              style={{ color: CHROME.muted }}
            />
          ),
          perform: () => {
            ctx.setSelectedSectionId(ref.sectionId);
            onClose();
          },
        });
      }
    }

    // Drawers — five right-side drawers in mockup order.
    rows.push(
      drawerRow(
        "open-publish",
        "Open Publish",
        "Review draft + publish to live",
        ["publish", "ship", "go live"],
        () => {
          ctx.openPublish();
          onClose();
        },
      ),
      drawerRow(
        "open-page-settings",
        "Open Page settings",
        "Title, meta description, indexability",
        ["settings", "metadata", "seo"],
        () => {
          ctx.openPageSettings();
          onClose();
        },
      ),
      drawerRow(
        "open-revisions",
        "Open Revisions",
        "Browse and restore prior drafts",
        ["history", "rollback", "restore", "version"],
        () => {
          ctx.openRevisions();
          onClose();
        },
      ),
      drawerRow(
        "open-theme",
        "Open Theme drawer",
        "Colors, typography, layout, effects",
        ["design", "tokens", "brand", "fonts", "color"],
        () => {
          ctx.openTheme();
          onClose();
        },
      ),
      drawerRow(
        "open-assets",
        "Open Assets library",
        "Uploaded media + brand kit",
        ["media", "images", "uploads", "files"],
        () => {
          ctx.openAssets();
          onClose();
        },
      ),
    );

    // Actions — undo, redo, save draft, duplicate / move / delete (when
    // a section is selected). Driven by the SHORTCUTS registry so the
    // palette and the keyboard overlay show the same chips.
    if (ctx.canUndo) {
      rows.push(
        actionRow("undo", "Undo last change", ["revert", "back"], () => {
          void ctx.undo();
          onClose();
        }),
      );
    }
    if (ctx.canRedo) {
      rows.push(
        actionRow("redo", "Redo", ["reapply", "forward"], () => {
          void ctx.redo();
          onClose();
        }),
      );
    }
    rows.push(
      actionRow(
        "save-draft",
        "Save draft checkpoint",
        ["save", "snapshot", "checkpoint"],
        () => {
          void ctx.saveDraft();
          onClose();
        },
      ),
      actionRow(
        "share-link",
        "Share preview link",
        ["share", "preview", "link", "url", "copy"],
        () => {
          // Fire-and-forget: close immediately, then resolve in the
          // background. The topbar Share button shows the same
          // confirmation chip path; from the palette we just route the
          // URL to the clipboard and surface failures via the toast.
          void (async () => {
            try {
              const res = await createShareLinkAction({});
              if (!res.ok) {
                ctx.reportMutationError(res.error);
                return;
              }
              if (
                typeof window === "undefined" ||
                typeof navigator === "undefined" ||
                !navigator.clipboard
              ) {
                return;
              }
              const url = `${window.location.origin}${res.path}`;
              try {
                await navigator.clipboard.writeText(url);
              } catch {
                window.prompt("Share link", url);
              }
            } catch (err) {
              ctx.reportMutationError(
                err instanceof Error
                  ? err.message
                  : "Failed to create share link.",
              );
            }
          })();
          onClose();
        },
      ),
    );
    if (ctx.selectedSectionId) {
      const id = ctx.selectedSectionId;
      rows.push(
        actionRow(
          "duplicate-section",
          "Duplicate selected section",
          ["copy", "clone"],
          () => {
            void ctx.duplicateSection(id).then((res) => {
              if (res.ok && res.newSectionId) {
                ctx.setSelectedSectionId(res.newSectionId);
              }
            });
            onClose();
          },
        ),
        actionRow(
          "move-section-up",
          "Move section up",
          ["reorder", "up"],
          () => {
            void ctx.moveSection(id, "up");
            onClose();
          },
        ),
        actionRow(
          "move-section-down",
          "Move section down",
          ["reorder", "down"],
          () => {
            void ctx.moveSection(id, "down");
            onClose();
          },
        ),
        actionRow(
          "delete-section",
          "Delete selected section",
          ["remove", "trash"],
          () => {
            void ctx.removeSection(id).then((res) => {
              if (res.ok) ctx.setSelectedSectionId(null);
            });
            onClose();
          },
        ),
      );
    }

    // Navigation — navigator toggle + device switch.
    rows.push(
      navRow(
        "toggle-navigator",
        "Toggle Structure navigator",
        ["sidebar", "tree", "outline"],
        () => {
          ctx.toggleNavigator();
          onClose();
        },
      ),
    );
    const devices: ReadonlyArray<{ id: string; label: string; device: EditDevice }> = [
      { id: "switch-device-desktop", label: "Switch to Desktop preview", device: "desktop" },
      { id: "switch-device-tablet", label: "Switch to Tablet preview", device: "tablet" },
      { id: "switch-device-mobile", label: "Switch to Mobile preview", device: "mobile" },
    ];
    for (const d of devices) {
      if (ctx.device === d.device) continue;
      rows.push(
        navRow(d.id, d.label, ["device", "viewport", "responsive"], () => {
          ctx.setDevice(d.device);
          onClose();
        }),
      );
    }

    return rows;
  }, [
    ctx,
    onClose,
  ]);

  // Score + sort + group.
  const groupedResults = useMemo(() => {
    const scored = allRows
      .map((row) => ({ row, score: scoreRow(query, row) }))
      .filter(
        (entry): entry is { row: ResultRow; score: number } =>
          entry.score !== null,
      )
      .sort((a, b) => b.score - a.score);

    // Cap at 12 rows per group so a giant page doesn't dominate the view.
    const byGroup = new Map<ResultGroup, ResultRow[]>();
    for (const { row } of scored) {
      const list = byGroup.get(row.group) ?? [];
      if (list.length < 12) list.push(row);
      byGroup.set(row.group, list);
    }
    const groups: Array<{ group: ResultGroup; rows: ResultRow[] }> = [];
    for (const g of GROUP_ORDER) {
      const list = byGroup.get(g);
      if (list && list.length > 0) groups.push({ group: g, rows: list });
    }
    return groups;
  }, [allRows, query]);

  // Flat row list for keyboard nav.
  const flatRows = useMemo(
    () => groupedResults.flatMap((g) => g.rows),
    [groupedResults],
  );

  // Clamp activeIdx whenever the row count changes.
  useEffect(() => {
    if (activeIdx >= flatRows.length) {
      setActiveIdx(Math.max(0, flatRows.length - 1));
    }
  }, [activeIdx, flatRows.length]);

  // Reset selection to the first row whenever the query changes.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Scroll active row into view as the operator arrows down.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-row-idx="${activeIdx}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx, open]);

  // Keyboard handling on the input.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (flatRows.length === 0) return;
        setActiveIdx((i) => (i + 1) % flatRows.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (flatRows.length === 0) return;
        setActiveIdx((i) => (i - 1 + flatRows.length) % flatRows.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const row = flatRows[activeIdx];
        if (row) row.perform();
      }
    },
    [activeIdx, flatRows, onClose],
  );

  if (!open) return null;

  return (
    <div
      data-edit-overlay="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[150] flex items-start justify-center"
      style={{
        background: "rgba(11, 11, 13, 0.32)",
        paddingTop: "12vh",
      }}
      onClick={(e) => {
        // Click on the backdrop closes; clicks inside the card are
        // stopped below.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, calc(100vw - 32px))",
          background: CHROME.paper,
          borderRadius: CHROME_RADII.lg,
          boxShadow: CHROME_SHADOWS.popover,
          border: `1px solid ${CHROME.lineMid}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "76vh",
        }}
      >
        {/* search row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderBottom: `1px solid ${CHROME.line}`,
            background: CHROME.surface,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={CHROME.muted}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a section, drawer, or action…"
            spellCheck={false}
            autoComplete="off"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: 0,
              fontSize: 14,
              color: CHROME.ink,
              padding: 0,
            }}
          />
          <KbdSequence keys={["Esc"]} />
        </div>

        {/* result list */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "6px 0",
          }}
          role="listbox"
        >
          {flatRows.length === 0 ? (
            <EmptyState query={query} />
          ) : (
            groupedResults.map((g, gi) => {
              // Compute the absolute row index where this group starts so
              // each row knows its own activeIdx slot for keyboard nav.
              let baseIdx = 0;
              for (let i = 0; i < gi; i += 1) {
                baseIdx += groupedResults[i]!.rows.length;
              }
              return (
                <div key={g.group}>
                  <GroupHeader label={GROUP_LABELS[g.group]} />
                  {g.rows.map((row, ri) => {
                    const idx = baseIdx + ri;
                    return (
                      <Row
                        key={row.id}
                        row={row}
                        active={idx === activeIdx}
                        idx={idx}
                        onHover={() => setActiveIdx(idx)}
                        onCommit={() => row.perform()}
                      />
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* footer hint strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 14px",
            background: CHROME.paper2,
            borderTop: `1px solid ${CHROME.line}`,
            color: CHROME.muted,
            fontSize: 11,
          }}
        >
          <FooterHint label="Navigate" keys={["↑", "↓"]} />
          <FooterHint label="Run" keys={["↵"]} />
          <FooterHint label="Close" keys={["Esc"]} />
        </div>
      </div>
    </div>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "10px 14px 4px",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: CHROME.muted,
      }}
    >
      {label}
    </div>
  );
}

interface RowProps {
  row: ResultRow;
  active: boolean;
  idx: number;
  onHover: () => void;
  onCommit: () => void;
}

function Row({ row, active, idx, onHover, onCommit }: RowProps) {
  const baseStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "20px 1fr auto",
    gap: 10,
    alignItems: "center",
    padding: "8px 14px",
    cursor: "pointer",
    background: active ? CHROME.blueBg : "transparent",
    color: active ? CHROME.ink : CHROME.text,
    transition: "background 80ms ease",
  };
  return (
    <div
      data-row-idx={idx}
      role="option"
      aria-selected={active}
      style={baseStyle}
      onMouseEnter={onHover}
      onClick={onCommit}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: CHROME.muted,
        }}
      >
        {row.icon ?? <DefaultGroupGlyph group={row.group} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: CHROME.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.label}
        </div>
        {row.meta ? (
          <div
            style={{
              fontSize: 11,
              color: CHROME.muted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 1,
            }}
          >
            {row.meta}
          </div>
        ) : null}
      </div>
      {row.shortcut ? (
        <KbdSequence keys={row.shortcut.keys.slice()} />
      ) : null}
    </div>
  );
}

function DefaultGroupGlyph({ group }: { group: ResultGroup }) {
  const stroke = CHROME.muted;
  switch (group) {
    case "drawer":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.4">
          <rect x="2" y="3" width="12" height="10" rx="1.6" />
          <path d="M10 3v10" />
        </svg>
      );
    case "action":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.4">
          <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "navigation":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.4">
          <rect x="2" y="3" width="4" height="10" rx="1" />
          <path d="M9 4h5M9 8h5M9 12h3" strokeLinecap="round" />
        </svg>
      );
    case "page":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.4">
          <path d="M4 2h6l2 2v10H4z" />
          <path d="M10 2v3h2" />
        </svg>
      );
    default:
      return null;
  }
}

function EmptyState({ query }: { query: string }) {
  return (
    <div
      style={{
        padding: "32px 16px",
        textAlign: "center",
        color: CHROME.muted,
        fontSize: 13,
      }}
    >
      {query
        ? `No matches for “${query}”`
        : "Start typing to search the editor…"}
    </div>
  );
}

function FooterHint({ label, keys }: { label: string; keys: string[] }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <KbdSequence keys={keys} />
      <span>{label}</span>
    </span>
  );
}

// ── row factories ───────────────────────────────────────────────────────

function shortcutFor(id: string): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

function drawerRow(
  shortcutId: string,
  label: string,
  meta: string,
  keywords: ReadonlyArray<string>,
  perform: () => void,
): ResultRow {
  return {
    id: `drawer:${shortcutId}`,
    group: "drawer",
    label,
    meta,
    keywords,
    shortcut: shortcutFor(shortcutId),
    perform,
  };
}

function actionRow(
  shortcutId: string,
  label: string,
  keywords: ReadonlyArray<string>,
  perform: () => void,
): ResultRow {
  return {
    id: `action:${shortcutId}`,
    group: "action",
    label,
    keywords,
    shortcut: shortcutFor(shortcutId),
    perform,
  };
}

function navRow(
  shortcutId: string,
  label: string,
  keywords: ReadonlyArray<string>,
  perform: () => void,
): ResultRow {
  return {
    id: `nav:${shortcutId}`,
    group: "navigation",
    label,
    keywords,
    shortcut: shortcutFor(shortcutId),
    perform,
  };
}
