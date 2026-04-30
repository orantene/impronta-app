"use client";

/**
 * Navigation tab — inline header link editor.
 *
 * Operator mental model: "edit the list, the server makes it match".
 *
 * What this tab does:
 *   - Lists current header links in the active locale, in sortOrder.
 *   - Each row: drag handle, label input (inline rename), href input,
 *     visibility toggle, remove button.
 *   - Add link affordance at the bottom — appends a blank row that's
 *     visible immediately (locally keyed) and gets a real id once the
 *     server save settles.
 *   - Drag-reorder via the kit's <DraggableList>. Changes flush through
 *     the autosave bus on a 600ms debounce so a fast typist doesn't
 *     blast the server.
 *
 * What the operator never has to think about:
 *   - The split between draft (cms_navigation_items) and published
 *     (cms_navigation_menus). The bulk save action handles both in one
 *     round trip, then the live header reflects via router.refresh().
 */

import { useState } from "react";

import {
  DraggableList,
  InspectorGroup,
  type DragHandleProps,
} from "../../kit";
import { validateHref } from "../href-validation";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
}

interface RowState {
  id: string;
  label: string;
  href: string;
  visible: boolean;
  /** Server version for CAS. 0 for new rows. */
  version: number;
  /** Local-only flag — true when this row hasn't been saved yet. */
  isNew?: boolean;
}

export function NavigationTab({ config, patch }: Props) {
  const items = config.navigation.items;

  // Helper: convert local row state → action input shape.
  function toInput(rows: RowState[]) {
    return rows.map((r) => ({
      id: r.isNew ? null : r.id,
      label: r.label,
      href: r.href,
      visible: r.visible,
      expectedVersion: r.isNew ? 0 : r.version,
    }));
  }

  function onReorder(next: RowState[]) {
    patch.patchNavigation(toInput(next));
  }

  function onUpdate(id: string, patchObj: Partial<RowState>) {
    const next = items.map((it) =>
      it.id === id ? { ...it, ...patchObj } : it,
    ) as RowState[];
    patch.patchNavigation(toInput(next));
  }

  function onRemove(id: string) {
    const next = items.filter((it) => it.id !== id) as RowState[];
    patch.patchNavigation(toInput(next));
  }

  function onAdd() {
    const localId = `__new_${items.length}_${Date.now()}__`;
    const next: RowState[] = [
      ...items.map((it) => ({ ...it })),
      {
        id: localId,
        label: "New link",
        href: "/",
        visible: true,
        version: 0,
        isNew: true,
      },
    ];
    patch.patchNavigation(toInput(next));
  }

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Header navigation"
        info="The text links that appear in the header bar and inside the mobile menu. Drag to reorder. Changes save and publish on each edit."
      >
        {items.length === 0 ? (
          <EmptyState onAdd={onAdd} />
        ) : (
          <>
            <DraggableList<RowState>
              items={items as RowState[]}
              keyOf={(r) => r.id}
              onReorder={onReorder}
            >
              {(row, _i, handleProps) => (
                <NavRow
                  row={row}
                  handleProps={handleProps}
                  onChange={(p) => onUpdate(row.id, p)}
                  onRemove={() => onRemove(row.id)}
                />
              )}
            </DraggableList>
            <button
              type="button"
              onClick={onAdd}
              className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-[12px] font-medium text-stone-500 transition-colors duration-150 hover:bg-[#faf9f6] hover:text-stone-800 active:scale-[0.98]"
            >
              <PlusGlyph />
              Add link
            </button>
          </>
        )}
      </InspectorGroup>

    </div>
  );
}

// ── subcomponents ────────────────────────────────────────────────────

function NavRow({
  row,
  handleProps,
  onChange,
  onRemove,
}: {
  row: RowState;
  handleProps: DragHandleProps;
  onChange: (p: Partial<RowState>) => void;
  onRemove: () => void;
}) {
  const [labelDraft, setLabelDraft] = useState(row.label);
  const [hrefDraft, setHrefDraft] = useState(row.href);
  const hrefV = validateHref(hrefDraft);
  const hrefWarn = hrefV.kind === "warn";

  // Keep local drafts in sync if server state moves while we're idle.
  if (labelDraft !== row.label && document.activeElement?.tagName !== "INPUT") {
    setLabelDraft(row.label);
  }
  if (hrefDraft !== row.href && document.activeElement?.tagName !== "INPUT") {
    setHrefDraft(row.href);
  }

  return (
    // 2027 list-item pattern (à la Linear / Framer / Notion):
    //   - No per-row card border. Whitespace + a soft hover wash define
    //     the row.
    //   - Single horizontal line: drag · label · href · actions.
    //   - Label and href inputs are borderless, transparent-bg, blend
    //     into the row until focused.
    //   - Action icons (eye, trash) hide until row hover/focus-within.
    //   - Hidden-link state (visibility=false) softens text + dims the
    //     row, no decorative dashes.
    <div
      className={`group/row relative flex items-center gap-2 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-[#faf9f6] focus-within:bg-[#faf9f6] ${
        row.visible ? "" : "opacity-55"
      }`}
    >
      {/* Drag handle — left rail. Larger hit target (28px), prominent on
       *  hover so the affordance is obvious. */}
      <button
        type="button"
        aria-label="Drag to reorder"
        title="Drag"
        {...handleProps}
        className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-stone-300 transition-colors duration-150 hover:bg-stone-100 hover:text-stone-700 active:cursor-grabbing"
      >
        <DragGlyph />
      </button>

      {/* Inputs column. Label is the primary visual; href sits below it
       *  one font-size smaller, monospaced, dim — secondary metadata. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0">
        <input
          type="text"
          className="w-full rounded-sm border-0 bg-transparent px-1 py-0.5 text-[13px] font-medium text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-indigo-300/40 focus:bg-white"
          placeholder="Link label"
          value={labelDraft}
          maxLength={60}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => {
            if (labelDraft.trim() !== row.label) {
              onChange({ label: labelDraft.trim() || row.label });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setLabelDraft(row.label);
              e.currentTarget.blur();
            }
          }}
        />
        <input
          type="text"
          className={`w-full rounded-sm border-0 bg-transparent px-1 py-0 font-mono text-[10.5px] focus:outline-none focus:ring-1 focus:bg-white ${
            hrefWarn
              ? "text-amber-700 focus:ring-amber-400/40"
              : "text-stone-400 focus:ring-indigo-300/40"
          }`}
          placeholder="/path or https://…"
          value={hrefDraft}
          maxLength={500}
          onChange={(e) => setHrefDraft(e.target.value)}
          onBlur={() => {
            if (hrefDraft.trim() !== row.href) {
              onChange({ href: hrefDraft.trim() || row.href });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setHrefDraft(row.href);
              e.currentTarget.blur();
            }
          }}
          title={hrefWarn ? hrefV.message : undefined}
        />
      </div>

      {/* Action cluster — hide until row hover/focus. Smaller hit
       *  targets (24px) so the row stays compact. */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
        <button
          type="button"
          onClick={() => onChange({ visible: !row.visible })}
          aria-label={row.visible ? "Hide link" : "Show link"}
          title={row.visible ? "Hide" : "Show"}
          className="inline-flex size-6 items-center justify-center rounded text-stone-400 transition-colors duration-150 hover:bg-white hover:text-stone-700"
        >
          {row.visible ? <EyeGlyph /> : <EyeOffGlyph />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove link"
          title="Remove"
          className="inline-flex size-6 items-center justify-center rounded text-stone-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
        >
          <TrashGlyph />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#e5e0d5] bg-[#faf9f6]/60 px-4 py-10 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-white text-stone-400">
        <LinksGlyph />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-stone-700">
          No header links yet
        </span>
        <span className="max-w-xs text-[11.5px] leading-snug text-stone-500">
          Add About, Studio, FAQ, or whatever the visitor needs to find from the
          top of every page.
        </span>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#3d4f7c] px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#4a5e94]"
      >
        <PlusGlyph />
        Add first link
      </button>
    </div>
  );
}



// ── glyphs ───────────────────────────────────────────────────────────

function DragGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function EyeGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function LinksGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
