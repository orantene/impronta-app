"use client";

/**
 * SlashCommandCanvasTrigger — 2026 page-builder batch (Lane E), item 3.
 *
 * The "/" insert menu also opens WITHOUT entering text-edit mode: select a
 * freeform prose block (heading / paragraph / rich text) on the canvas and
 * press "/" — same menu, anchored to the block instead of a caret. Reuses
 * `SlashCommandMenu` + `slash-command-catalog.ts`, the same catalog + fuzzy
 * matcher `SlashCommandPlugin.tsx` (the in-text-editing trigger) uses.
 *
 * Deliberately its own module, not a `selection-layer.tsx` edit — another
 * lane owns that file this batch. Gates via the SAME exported helpers
 * `selection-layer.tsx`'s own shortcut handlers use
 * (`isEditableKeyboardTarget`, `keyboardFocusIsOnCanvas` from
 * `builder-keyboard.ts`), so it composes with the existing canvas shortcut
 * set without touching it.
 *
 * Once open, a visually-hidden focusable `<input>` (not `display:none` —
 * that would refuse focus) receives the query text as the operator keeps
 * typing. This is deliberate, not incidental: with a real `<input>` focused,
 * `document.activeElement` satisfies `isEditableKeyboardTarget`, so every
 * OTHER canvas keyboard shortcut (delete-block, nudge, etc.) already defers
 * via its own existing `isEditableKeyboardTarget` gate — no changes needed
 * anywhere else. A manual per-keystroke capture would have had to reinvent
 * that deferral for every shortcut it might collide with.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { useEditContext } from "./edit-context";
import { useBuilderTree } from "./builder-tree-bridge";
import { useSelectedBuilderNodeId } from "./selection-bridge";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";
import {
  isEditableKeyboardTarget,
  keyboardFocusIsOnCanvas,
} from "./builder-keyboard";
import { isCanvasInlineTextEditActive } from "./canvas-lexical-bridge";
import { resolveInsertAnchor } from "./add-gallery/gallery-insert-hint";
import { getViewportSectionNodeId } from "./add-gallery/viewport-section-anchor";
import { allowedKindsForInsertParent } from "./slash-command-insert-target";
import { locateCanvasNode } from "./freeform-layer-row";
import { useSlashCommandEntries } from "./use-slash-command-entries";
import { SlashCommandMenu } from "./slash-command-menu";
import type { SlashCommandEntry } from "./slash-command-catalog";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";
import { useEditorLocale } from "./use-editor-locale";

/** Prose kinds an operator would naturally hit "/" to continue from. */
const PROSE_KINDS: ReadonlySet<BuilderNodeKind> = new Set([
  "heading",
  "paragraph",
  "rich_text",
]);

const HIDDEN_INPUT_STYLE: CSSProperties = {
  position: "fixed",
  top: -9999,
  left: -9999,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: "none",
};

export function SlashCommandCanvasTrigger() {
  const { t } = useEditorLocale();
  const {
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
    reportMutationError,
    selectBuilderNode,
    previewing,
  } = useEditContext();
  const builderTree = useBuilderTree();
  const selectedBuilderNodeId = useSelectedBuilderNodeId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<{
    top: number;
    bottom: number;
    left: number;
  } | null>(null);

  const selectedNode = useMemo(
    () => findBuilderNodeById(builderTree, selectedBuilderNodeId),
    [builderTree, selectedBuilderNodeId],
  );
  const isProseSelected = Boolean(selectedNode && PROSE_KINDS.has(selectedNode.kind));

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setTargetNodeId(null);
    setAnchorRect(null);
    inputRef.current?.blur();
  }, []);

  // ── the "/" trigger — only listens while the menu is closed ───────────
  useEffect(() => {
    if (open || previewing) return undefined;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableKeyboardTarget(e.target) || !keyboardFocusIsOnCanvas()) return;
      if (isCanvasInlineTextEditActive()) return;
      if (!selectedBuilderNodeId || !isProseSelected) return;
      const el = document.querySelector<HTMLElement>(
        `[data-builder-node-id="${CSS.escape(selectedBuilderNodeId)}"]`,
      );
      if (!el) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setTargetNodeId(selectedBuilderNodeId);
      setAnchorRect({ top: rect.top, bottom: rect.bottom, left: rect.left });
      setOpen(true);
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, previewing, selectedBuilderNodeId, isProseSelected]);

  // ── insert target (anchor + allowed kinds), resolved once per open ────
  const insertPlan = useMemo(() => {
    if (!targetNodeId) return null;
    const anchor = resolveInsertAnchor(builderTree, targetNodeId, getViewportSectionNodeId());
    const allowedKinds = allowedKindsForInsertParent(
      builderTree,
      anchor.parentId,
      advancedElementLibraryEnabled,
      canInsertRawHtmlElements,
    );
    return { anchor, allowedKinds };
  }, [targetNodeId, builderTree, advancedElementLibraryEnabled, canInsertRawHtmlElements]);

  const entries = useSlashCommandEntries({
    enabled: open,
    allowedKinds: insertPlan?.allowedKinds ?? [],
    includeSectionEmbeds: Boolean(insertPlan?.allowedKinds.includes("section_embed")),
    query,
  });

  useEffect(() => {
    setActiveIndex((i) => (entries.length === 0 ? 0 : Math.min(i, entries.length - 1)));
  }, [entries.length]);

  const commit = useCallback(
    (entry: SlashCommandEntry) => {
      if (!insertPlan) return;
      const { anchor } = insertPlan;
      const after = (result: { ok: boolean; error?: string; nodeId?: string }) => {
        close();
        if (!result.ok) {
          if (result.error) reportMutationError(result.error);
          return;
        }
        if (result.nodeId) {
          selectBuilderNode(result.nodeId);
          locateCanvasNode(result.nodeId);
        }
      };
      if (entry.pickKind === "element") {
        void insertBuilderNode(anchor.parentId, entry.elementKind, anchor.index).then(after);
      } else if (entry.pickKind === "sectionEmbed") {
        void insertBuilderSectionEmbed(anchor.parentId, entry.sectionTypeKey, anchor.index).then(
          after,
        );
      } else {
        void insertBuilderComponent(
          anchor.parentId,
          JSON.stringify(entry.block.subtree),
          anchor.index,
        ).then(after);
      }
    },
    [
      insertPlan,
      insertBuilderNode,
      insertBuilderSectionEmbed,
      insertBuilderComponent,
      reportMutationError,
      selectBuilderNode,
      close,
    ],
  );

  if (!open) return null;

  return (
    <>
      <input
        ref={inputRef}
        aria-label={t("Search blocks to insert")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (entries.length ? (i + 1) % entries.length : 0));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) =>
              entries.length ? (i - 1 + entries.length) % entries.length : 0,
            );
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const entry = entries[activeIndex];
            if (entry) commit(entry);
            else close();
          }
        }}
        style={HIDDEN_INPUT_STYLE}
        tabIndex={-1}
      />
      <SlashCommandMenu
        anchorRect={anchorRect}
        query={query}
        entries={entries}
        activeIndex={activeIndex}
        onHover={setActiveIndex}
        onCommit={commit}
        onClose={close}
      />
    </>
  );
}
