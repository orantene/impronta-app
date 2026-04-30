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
  KIT,
  type DragHandleProps,
} from "../../kit";
import { GroupDescription } from "../tab-helpers";
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
  const locale = config.navigation.locale;

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
      <InspectorGroup title="Header navigation">
        <GroupDescription>
          The text links that appear in the header bar (and inside the mobile
          menu). Drag to reorder. Changes save and publish on each edit.
        </GroupDescription>
        <LocaleHint locale={locale} />

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
              className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg border border-dashed border-[#e5e0d5] bg-white px-3 py-2 text-[12px] font-medium text-stone-600 transition hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700"
            >
              <PlusGlyph />
              Add link
            </button>
          </>
        )}
      </InspectorGroup>

      <InspectorGroup
        title="Coming next pass"
        advanced
        collapsible
        storageKey="header:nav:next-pass"
      >
        <GroupDescription>
          Inline UX that lands once the next session: locale switching for
          multi-language sites, and submenu support for nested links.
        </GroupDescription>
        <NextPassRow
          label="Locale switcher"
          hint="Edit en + es independently from the same drawer."
        />
        <NextPassRow
          label="Submenu support"
          hint="Two-level nav for sites that need it. Hidden by default."
        />
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

  // Keep local draft in sync if the server-side state changes (e.g.
  // the operator added a row, server returned with a real id, this row
  // remounts with the canonical label).
  if (labelDraft !== row.label && document.activeElement?.tagName !== "INPUT") {
    setLabelDraft(row.label);
  }
  if (hrefDraft !== row.href && document.activeElement?.tagName !== "INPUT") {
    setHrefDraft(row.href);
  }

  return (
    <div
      className={`group flex items-center gap-2 rounded-lg border bg-[#faf9f6] px-2 py-2 transition ${
        row.visible
          ? "border-[#e5e0d5] hover:border-stone-300"
          : "border-dashed border-stone-300 opacity-70"
      }`}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...handleProps}
        className="flex size-6 shrink-0 cursor-grab items-center justify-center text-stone-300 transition hover:text-stone-600 active:cursor-grabbing"
      >
        <DragGlyph />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <input
          type="text"
          className={`${KIT.input} py-1.5 text-[12.5px] font-medium`}
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
          className={`${KIT.input} py-1 text-[11px] font-mono text-stone-500`}
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
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onChange({ visible: !row.visible })}
          aria-label={row.visible ? "Hide link" : "Show link"}
          title={row.visible ? "Hide" : "Show"}
          className={`inline-flex size-7 items-center justify-center rounded-md transition ${
            row.visible
              ? "text-stone-500 hover:bg-white hover:text-stone-800"
              : "text-stone-400 hover:bg-white hover:text-stone-700"
          }`}
        >
          {row.visible ? <EyeGlyph /> : <EyeOffGlyph />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove link"
          title="Remove"
          className="inline-flex size-7 items-center justify-center rounded-md text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
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

function LocaleHint({ locale }: { locale: string }) {
  return (
    <div className="-mt-1 mb-1 flex items-center gap-2 text-[10.5px] text-stone-400">
      <span aria-hidden className="inline-block size-1 rounded-full bg-stone-300" />
      <span>
        Editing the{" "}
        <span className="font-mono font-semibold text-stone-500">{locale}</span>{" "}
        menu. Multi-locale switching arrives in the next pass.
      </span>
    </div>
  );
}

function NextPassRow({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-dashed border-[#e5e0d5] bg-white px-3 py-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-medium text-stone-600">{label}</span>
        <span className="text-[10.5px] text-stone-400">{hint}</span>
      </div>
      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-stone-500">
        Next pass
      </span>
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
