"use client";

/**
 * Columns tab — the footer's link lists.
 *
 * This is the tab the auto-bound `ZodSchemaForm` handled worst: `columns` is an
 * array of objects each containing an array of objects, and the generic form
 * rendered it as nested untitled rows with no reorder and no way to see the
 * shape. Here it is a real two-level list editor.
 *
 * TWO LEVELS OF DRAG, DELIBERATELY SEPARATE
 * --------------------------------------------------------------------------
 * Columns reorder among themselves; links reorder within their own column.
 * There is no cross-column link drag. That is a real limitation, and it is the
 * right one for now: cross-list drag needs a shared drop controller that
 * `DraggableList` does not have, and the workaround (retype the link in the
 * other column, three fields) is cheap. Building a half-working cross-list drag
 * would be worse than not having it.
 *
 * Caps come from the schema (5 columns × 8 links) and are enforced in the pure
 * merge as well, so a race can never produce a payload Zod rejects. The UI
 * disables the add affordance at the cap rather than letting the operator click
 * into a silent failure.
 */

import { useState } from "react";

import {
  DraggableList,
  InspectorGroup,
  type DragHandleProps,
} from "../../kit";
import { useInspectorT } from "../../kit/use-inspector-t";
import type {
  SiteFooterColumn,
  SiteFooterLink,
} from "@/lib/site-admin/site-footer/types";
import type { SiteFooterPatch } from "../SiteFooterInspector";
import { DragGlyph, PlusGlyph, TrashGlyph } from "../glyphs";

/** Schema caps — mirrored from `sections/site_footer/schema.ts`. */
const MAX_COLUMNS = 5;
const MAX_LINKS_PER_COLUMN = 8;

export function ColumnsTab({ api }: { api: SiteFooterPatch }) {
  const { t } = useInspectorT();
  const { value, patch } = api;
  const columns = value.columns;

  function setColumns(next: SiteFooterColumn[]) {
    patch({ columns: next });
  }

  function updateColumn(index: number, next: Partial<SiteFooterColumn>) {
    setColumns(columns.map((c, i) => (i === index ? { ...c, ...next } : c)));
  }

  function removeColumn(index: number) {
    setColumns(columns.filter((_, i) => i !== index));
  }

  function addColumn() {
    if (columns.length >= MAX_COLUMNS) return;
    setColumns([...columns, { heading: t("New column"), links: [] }]);
  }

  const atColumnCap = columns.length >= MAX_COLUMNS;

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Link columns"
        info="The grouped link lists in the body of the footer. Drag a column to reorder it; drag a link to reorder it inside its column."
        searchTerms={["columns", "links", "navigation", "menu", "sitemap"]}
      >
        {columns.length === 0 ? (
          <ColumnsEmptyState onAdd={addColumn} />
        ) : (
          <>
            <DraggableList<SiteFooterColumn>
              items={columns}
              keyOf={(_column, index) => `column-${index}`}
              onReorder={setColumns}
            >
              {(column, index, handleProps) => (
                <ColumnCard
                  column={column}
                  handleProps={handleProps}
                  onChange={(next) => updateColumn(index, next)}
                  onRemove={() => removeColumn(index)}
                />
              )}
            </DraggableList>
            <button
              type="button"
              onClick={addColumn}
              disabled={atColumnCap}
              title={
                atColumnCap
                  ? t("A footer can hold at most 5 columns.")
                  : undefined
              }
              className="mt-1 inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-[12px] font-medium text-stone-500 transition-colors duration-150 hover:bg-[#faf9f6] hover:text-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <PlusGlyph />
              {t("Add column")}
            </button>
          </>
        )}
      </InspectorGroup>
    </div>
  );
}

// ── column ───────────────────────────────────────────────────────────────────

function ColumnCard({
  column,
  handleProps,
  onChange,
  onRemove,
}: {
  column: SiteFooterColumn;
  handleProps: DragHandleProps;
  onChange: (next: Partial<SiteFooterColumn>) => void;
  onRemove: () => void;
}) {
  const { t } = useInspectorT();
  const links = column.links;
  const atLinkCap = links.length >= MAX_LINKS_PER_COLUMN;

  function setLinks(next: SiteFooterLink[]) {
    onChange({ links: next });
  }

  return (
    <div className="group/col mb-2 flex flex-col gap-1.5 rounded-lg border border-stone-200/70 bg-white/60 p-2 transition-colors duration-150 focus-within:border-indigo-300/70 hover:border-stone-300">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={t("Drag to reorder column")}
          title={t("Drag to reorder column")}
          {...handleProps}
          className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-stone-500 transition-[color,background-color] duration-150 hover:bg-stone-100 hover:text-stone-900 active:cursor-grabbing active:bg-stone-200/70"
        >
          <DragGlyph />
        </button>
        <CommittedInput
          value={column.heading}
          maxLength={60}
          placeholder={t("Column heading")}
          ariaLabel={t("Column heading")}
          className="min-w-0 flex-1 cursor-text rounded-sm border-0 bg-transparent px-1.5 py-0.5 text-[13px] font-semibold text-stone-800 placeholder:text-stone-400 transition-colors duration-150 hover:bg-stone-50 focus:bg-stone-50 focus:outline-none"
          onCommit={(next) => onChange({ heading: next })}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("Remove column")}
          title={t("Remove column")}
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-stone-500 opacity-40 transition-[opacity,color,background-color] duration-150 hover:bg-rose-50 hover:text-rose-600 group-focus-within/col:opacity-100 group-hover/col:opacity-100"
        >
          <TrashGlyph />
        </button>
      </div>

      <div className="pl-[34px]">
        {links.length === 0 ? (
          <p className="px-1.5 py-1 text-[11px] italic text-stone-400">
            {t("No links in this column yet.")}
          </p>
        ) : (
          <DraggableList<SiteFooterLink>
            items={links}
            keyOf={(_link, index) => `link-${index}`}
            onReorder={setLinks}
          >
            {(link, index, linkHandleProps) => (
              <LinkRow
                link={link}
                handleProps={linkHandleProps}
                onChange={(next) =>
                  setLinks(
                    links.map((l, i) => (i === index ? { ...l, ...next } : l)),
                  )
                }
                onRemove={() => setLinks(links.filter((_, i) => i !== index))}
              />
            )}
          </DraggableList>
        )}
        <button
          type="button"
          onClick={() => {
            if (atLinkCap) return;
            setLinks([...links, { label: t("New link"), href: "/" }]);
          }}
          disabled={atLinkCap}
          title={
            atLinkCap ? t("A column can hold at most 8 links.") : undefined
          }
          className="mt-0.5 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11.5px] font-medium text-stone-500 transition-colors duration-150 hover:bg-stone-50 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <PlusGlyph />
          {t("Add link")}
        </button>
      </div>
    </div>
  );
}

// ── link row ─────────────────────────────────────────────────────────────────

export function LinkRow({
  link,
  handleProps,
  onChange,
  onRemove,
}: {
  link: SiteFooterLink;
  handleProps?: DragHandleProps;
  onChange: (next: Partial<SiteFooterLink>) => void;
  onRemove: () => void;
}) {
  const { t } = useInspectorT();
  return (
    <div className="group/row relative flex items-center gap-1 rounded-md bg-white/55 px-1 py-0.5 ring-1 ring-transparent transition-[background-color,box-shadow] duration-150 focus-within:bg-white focus-within:ring-indigo-300/60 hover:bg-white hover:ring-stone-200/80">
      {handleProps ? (
        <button
          type="button"
          aria-label={t("Drag to reorder link")}
          title={t("Drag to reorder link")}
          {...handleProps}
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-stone-400 transition-[color,background-color] duration-150 hover:bg-stone-100 hover:text-stone-800 active:cursor-grabbing"
        >
          <DragGlyph />
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <CommittedInput
          value={link.label}
          maxLength={60}
          placeholder={t("Link label")}
          ariaLabel={t("Link label")}
          className="w-full cursor-text rounded-sm border-0 bg-transparent px-1.5 py-0.5 text-[12.5px] font-medium text-stone-800 placeholder:text-stone-400 transition-colors duration-150 hover:bg-stone-50 focus:bg-stone-50 focus:outline-none"
          onCommit={(next) => onChange({ label: next })}
        />
        <CommittedInput
          value={link.href}
          maxLength={500}
          placeholder={t("/path or https://…")}
          ariaLabel={t("Link destination")}
          className="w-full cursor-text rounded-sm border-0 bg-transparent px-1.5 py-0 font-mono text-[10.5px] text-stone-500 placeholder:text-stone-400 transition-colors duration-150 hover:bg-stone-50 focus:bg-stone-50 focus:outline-none"
          onCommit={(next) => onChange({ href: next })}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("Remove link")}
        title={t("Remove link")}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-stone-500 opacity-40 transition-[opacity,color,background-color] duration-150 hover:bg-rose-50 hover:text-rose-600 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
      >
        <TrashGlyph />
      </button>
    </div>
  );
}

/**
 * A text input that keeps a LOCAL draft and only commits on blur / Enter.
 *
 * Committing per keystroke would push a whole `columns` array through the patch
 * bus on every character — the debounce would coalesce the network calls, but
 * each keystroke would still rebuild the array and re-key the list, and a drag
 * handle re-keyed mid-type loses its grab. Escape reverts, which is the
 * behaviour the header's nav rows established.
 */
function CommittedInput({
  value,
  onCommit,
  className,
  placeholder,
  ariaLabel,
  maxLength,
}: {
  value: string;
  onCommit: (next: string) => void;
  className: string;
  placeholder: string;
  ariaLabel: string;
  maxLength: number;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  // Adopt server-side changes only while this field is NOT being edited, so a
  // save landing mid-type never yanks the cursor.
  if (!editing && draft !== value) setDraft(value);

  return (
    <input
      type="text"
      className={className}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        const next = draft.trim();
        if (next && next !== value) onCommit(next);
        else if (!next) setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        else if (event.key === "Escape") {
          setDraft(value);
          setEditing(false);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ColumnsEmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useInspectorT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#e5e0d5] bg-[#faf9f6]/60 px-4 py-10 text-center">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-stone-700">
          {t("No footer columns yet")}
        </span>
        <span className="max-w-xs text-[11.5px] leading-snug text-stone-500">
          {t("Group the links visitors look for at the end of a page: Studio, Roster, Contact.")}
        </span>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-violet-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-violet-500"
      >
        <PlusGlyph />
        {t("Add first column")}
      </button>
    </div>
  );
}
