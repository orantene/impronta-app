"use client";

/**
 * catalog-studio-kit — shared primitives + drag helpers for CatalogStudioView
 * (WS-B B3). Split out of catalog-studio.tsx to keep each file under the
 * max-lines lint cap. Pure presentational/utility code; the tree logic + server
 * actions live in catalog-studio.tsx.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// Import from the specific modules (NOT the add-gallery barrel) so this client
// kit — and its node:test — never pull in the barrel's DOM/perform-insert graph
// (which transitively imports a .css file that breaks tsx --test).
import { ADD_GALLERY_CATEGORIES } from "@/lib/site-admin/add-gallery/registry";
import type { AddGalleryTab } from "@/lib/site-admin/add-gallery/types";
import {
  CODE_TAB_DEFS,
  type CatalogStructureMap,
} from "@/lib/site-admin/add-gallery/catalog-structure";

import { LAB as T } from "./ui";

// ── hidden-entry derivation (pure) ─────────────────────────────────────────────

export type HiddenEntry = { id: string; label: string };

/** Tabs the admin has hidden (filtered out of resolveTabs), with display label. */
export function hiddenTabs(structure: CatalogStructureMap): HiddenEntry[] {
  return CODE_TAB_DEFS.filter((t) => structure[`tab:${t.id}`]?.hidden).map(
    (t) => ({
      id: t.id,
      label: structure[`tab:${t.id}`]?.label_override ?? t.label,
    }),
  );
}

/**
 * Categories the admin has hidden, grouped by the tab they'd belong to (the
 * override's parent_tab, else the code default). Created categories that were
 * later hidden are included under their parent_tab.
 */
export function hiddenCategoriesByTab(
  structure: CatalogStructureMap,
): Record<string, HiddenEntry[]> {
  const out: Record<string, HiddenEntry[]> = {};
  const codeById = new Map(ADD_GALLERY_CATEGORIES.map((c) => [c.id, c]));
  for (const row of Object.values(structure)) {
    if (row.kind !== "category" || !row.hidden) continue;
    const id = row.ref.slice("cat:".length);
    const code = codeById.get(id);
    const tab = row.parent_tab ?? code?.tab;
    if (!tab) continue;
    const label = row.label_override ?? code?.label ?? id;
    (out[tab] ??= []).push({ id, label });
  }
  return out;
}

// ── slug ────────────────────────────────────────────────────────────────────────

/** Generate a stable category slug from a human name (kebab-case, ascii). */
export function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// ── drag payloads ────────────────────────────────────────────────────────────────

/** Drag payloads carried on the dataTransfer. Discriminated by `dragKind`. */
export type TabDrag = { dragKind: "tab"; tabId: string };
export type CatDrag = {
  dragKind: "category";
  catId: string;
  fromTab: AddGalleryTab;
};
export type ItemDrag = { dragKind: "item"; itemId: string };
export type DragPayload = TabDrag | CatDrag | ItemDrag;

export const DRAG_MIME = "application/x-catalog-studio";

export function readDrag(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return null;
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export function writeDrag(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

/** True when the dataTransfer carries one of our drag payloads. */
export function hasCatalogDrag(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(DRAG_MIME);
}

// ── shared primitives ────────────────────────────────────────────────────────────

export function DragHandle({
  ariaLabel,
  draggable,
  onDragStart,
  small,
}: {
  ariaLabel: string;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  small?: boolean;
}) {
  return (
    <span
      role="button"
      aria-label={ariaLabel}
      title="Drag to move"
      draggable={draggable}
      onDragStart={onDragStart}
      tabIndex={0}
      style={{
        cursor: draggable ? "grab" : "default",
        color: T.inkDim,
        fontSize: small ? 11 : 13,
        lineHeight: 1,
        userSelect: "none",
        flexShrink: 0,
        padding: "0 1px",
      }}
    >
      ⠿
    </span>
  );
}

export function InlineRename({
  value,
  ariaLabel,
  disabled,
  bold,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  disabled: boolean;
  bold?: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  // Keep the local draft in sync when the resolved label changes underneath us
  // (e.g. after a reload reorders things) — but never clobber an active edit.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === value) return;
    onCommit(trimmed);
  }, [draft, value, onCommit]);

  return (
    <input
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        focused.current = false;
        e.currentTarget.style.border = "1px solid transparent";
        e.currentTarget.style.background = "transparent";
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      style={{
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 6,
        color: T.ink,
        fontSize: bold ? 13 : 12.5,
        fontWeight: bold ? 700 : 600,
        padding: "3px 6px",
        maxWidth: 220,
        outline: "none",
      }}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.style.border = `1px solid ${T.border}`;
        e.currentTarget.style.background = T.field;
      }}
      onMouseDown={(e) => {
        // Don't let the parent drag handle hijack the click into a drag.
        e.stopPropagation();
      }}
    />
  );
}

export function RowActions({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}
    >
      {children}
    </span>
  );
}

export function HideToggle({
  hidden,
  disabled,
  onClick,
  label,
}: {
  hidden: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={hidden ? "Show" : "Hide from gallery"}
      className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
      style={{
        background: "transparent",
        border: "none",
        color: T.inkMuted,
        fontSize: 11.5,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
      }}
    >
      Hide
    </button>
  );
}

export function RevertBtn({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Revert to built-in default"
      className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
      style={{
        background: "transparent",
        border: "none",
        color: T.accent,
        fontSize: 11.5,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
      }}
    >
      Revert
    </button>
  );
}

/**
 * A row of "show again" chips for tabs/categories the admin has hidden. Hidden
 * items are filtered out of the resolvers, so without this they'd be an
 * un-reachable dead-end — clicking a chip un-hides it.
 */
export function HiddenRestoreRow({
  label,
  entries,
  disabled,
  onRestore,
}: {
  label: string;
  entries: ReadonlyArray<{ id: string; label: string }>;
  disabled: boolean;
  onRestore: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "6px 2px",
      }}
    >
      <span style={{ fontSize: 10.5, color: T.inkDim, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </span>
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onRestore(e.id)}
          disabled={disabled}
          title={`Show ${e.label} again`}
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "transparent",
            border: `1px dashed ${T.border}`,
            color: T.inkMuted,
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: 999,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <span aria-hidden style={{ fontSize: 9 }}>＋</span>
          {e.label}
        </button>
      ))}
    </div>
  );
}
