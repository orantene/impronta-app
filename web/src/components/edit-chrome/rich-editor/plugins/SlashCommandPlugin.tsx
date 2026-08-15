"use client";

/**
 * SlashCommandPlugin — Notion/Framer-style "/" insert menu, 2026 page-builder
 * batch (Lane E).
 *
 * NOT governed by `KeyboardShortcutsPlugin`'s "Phase C scope cap" header
 * comment — that cap is about TEXT FORMATTING shortcuts (⌘B/⌘I/⌘K). This is
 * a new INSERT surface the owner explicitly requested, so it ships as its
 * own plugin rather than extending that one.
 *
 * Mechanics: typing "/" at the start of an empty paragraph/heading, or right
 * after whitespace, opens a floating menu anchored at the caret (never
 * mid-word — "and/or" stays literal text, see `slash-command-trigger.ts`
 * for the pure trigger rule). Continued typing filters the menu with the
 * same fuzzy matcher the ⌘K command palette uses
 * (`slash-command-catalog.ts`). ArrowUp/Down move the highlight, Enter
 * commits, Escape closes and leaves the literal "/query" text untouched.
 *
 * On commit: the "/query" text is spliced out of the text node, then (after
 * that edit flushes) the host's `config.onPick*` callback runs — the host
 * (`CanvasEditOverlay`) wraps it to commit the now-clean text into node
 * history first, then the actual node insert happens via the existing
 * `insertBuilderNode` / `resolveInsertAnchor` / `locateCanvasNode` plumbing
 * one level up (`inline-editor.tsx`), which is the only place that has
 * `useEditContext()`.
 *
 * `CanvasEditOverlay` intercepts Escape and (for single-line blocks) Enter
 * at the DOCUMENT capture phase to commit/close the whole inline editor —
 * that fires before Lexical ever sees the key. `onOpenChange` lets the host
 * know the menu is open so it can step aside for those two keys and let
 * Lexical's own command system (below) own them instead.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from "lexical";

import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";
import type { BuilderComponentRow } from "@/lib/site-admin/edit-mode/builder-components-action";
import {
  extractSlashQuery,
  shouldTriggerSlashCommand,
} from "./slash-command-trigger";
import { useSlashCommandEntries } from "../../use-slash-command-entries";
import { SlashCommandMenu } from "../../slash-command-menu";
import type { SlashCommandEntry } from "../../slash-command-catalog";

export interface SlashCommandInsertConfig {
  /** Registry + plan-gated kinds insertable after the current block. */
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  /** Whether the curated "Tulala" section-embed presets belong in this menu. */
  includeSectionEmbeds?: boolean;
  onPickElement: (kind: BuilderNodeKind) => void;
  onPickSectionEmbed?: (sectionTypeKey: string) => void;
  onPickSavedBlock?: (block: BuilderComponentRow) => void;
}

interface SlashTriggerState {
  /** The TextNode key that owns the "/" — the menu closes if the caret leaves it. */
  triggerNodeKey: string;
  /** Offset of the "/" character within that node's text. */
  triggerOffset: number;
  query: string;
  anchorRect: { top: number; bottom: number; left: number };
}

/** The current native-selection caret rect, for anchoring the menu. */
function caretDomRect(): { top: number; bottom: number; left: number } | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.top === 0 && rect.bottom === 0 && rect.left === 0) return null;
  return { top: rect.top, bottom: rect.bottom, left: rect.left };
}

export function SlashCommandPlugin({
  config,
  onOpenChange,
}: {
  config: SlashCommandInsertConfig;
  /** Lets the host step aside so Escape/Enter reach Lexical while the menu is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [trigger, setTrigger] = useState<SlashTriggerState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<SlashTriggerState | null>(null);
  useEffect(() => {
    triggerRef.current = trigger;
  }, [trigger]);

  const activeIndexRef = useRef(0);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const entries = useSlashCommandEntries({
    enabled: trigger !== null,
    allowedKinds: config.allowedKinds,
    includeSectionEmbeds: Boolean(config.includeSectionEmbeds),
    query: trigger?.query ?? "",
  });
  const entriesRef = useRef<ReadonlyArray<SlashCommandEntry>>(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Keep the highlighted row in range as the filtered list changes shape.
  useEffect(() => {
    setActiveIndex((i) => (entries.length === 0 ? 0 : Math.min(i, entries.length - 1)));
  }, [entries.length]);

  const closeMenu = useCallback(() => {
    setTrigger(null);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    onOpenChange?.(trigger !== null);
    // The cleanup covers BOTH re-runs (harmless false-then-true in the same
    // flush when `trigger` merely updates) and real unmount (tells the host
    // the menu is closed without a separate effect + disable comment).
    return () => onOpenChange?.(false);
  }, [trigger, onOpenChange]);

  // ── trigger detection + live query tracking ───────────────────────────
  // Reads (never mutates) Lexical state; the actual `setTrigger`/`closeMenu`
  // calls run directly inside the read callback — plain React state updates,
  // nothing Lexical-restricted about calling them from here.
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          if (triggerRef.current) closeMenu();
          return;
        }
        const anchor = selection.anchor;
        if (anchor.type !== "text") {
          if (triggerRef.current) closeMenu();
          return;
        }
        const node = anchor.getNode();
        if (!$isTextNode(node)) {
          if (triggerRef.current) closeMenu();
          return;
        }
        const text = node.getTextContent();
        const offset = anchor.offset;
        const current = triggerRef.current;

        if (!current) {
          if (offset > 0 && text[offset - 1] === "/") {
            const before = text.slice(0, offset - 1);
            if (shouldTriggerSlashCommand(before)) {
              const rect = caretDomRect();
              if (rect) {
                setTrigger({
                  triggerNodeKey: node.getKey(),
                  triggerOffset: offset - 1,
                  query: "",
                  anchorRect: rect,
                });
                setActiveIndex(0);
              }
            }
          }
          return;
        }

        if (node.getKey() !== current.triggerNodeKey) {
          closeMenu();
          return;
        }
        const nextQuery = extractSlashQuery(text, current.triggerOffset, offset);
        if (nextQuery === null) {
          closeMenu();
          return;
        }
        if (nextQuery !== current.query) {
          setTrigger({ ...current, query: nextQuery });
          setActiveIndex(0);
        }
      });
    });
  }, [editor, closeMenu]);

  // ── commit ─────────────────────────────────────────────────────────────
  const commitEntry = useCallback(
    (entry: SlashCommandEntry) => {
      const current = triggerRef.current;
      if (!current) return;
      editor.update(() => {
        const node = $getNodeByKey(current.triggerNodeKey);
        if (!$isTextNode(node)) return;
        const text = node.getTextContent();
        const selection = $getSelection();
        const caretOffset =
          $isRangeSelection(selection) &&
          selection.anchor.getNode().getKey() === node.getKey()
            ? selection.anchor.offset
            : text.length;
        const deleteCount = Math.max(0, caretOffset - current.triggerOffset);
        node.spliceText(current.triggerOffset, deleteCount, "", true);
      });
      closeMenu();
      // Deferred: the parent's onPick may commit the (now clean) text and
      // unmount this whole overlay — let the edit above flush first.
      setTimeout(() => {
        if (entry.pickKind === "element") {
          config.onPickElement(entry.elementKind);
        } else if (entry.pickKind === "sectionEmbed") {
          config.onPickSectionEmbed?.(entry.sectionTypeKey);
        } else {
          config.onPickSavedBlock?.(entry.block);
        }
      }, 0);
    },
    [editor, closeMenu, config],
  );

  // ── keyboard nav (Lexical command system — see the module doc for why
  //    CanvasEditOverlay must step aside on Escape/Enter while open) ──────
  useEffect(() => {
    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if (!triggerRef.current) return false;
        closeMenu();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (!triggerRef.current || entriesRef.current.length === 0) return false;
        event?.preventDefault();
        setActiveIndex((i) => (i + 1) % entriesRef.current.length);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (!triggerRef.current || entriesRef.current.length === 0) return false;
        event?.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + entriesRef.current.length) % entriesRef.current.length,
        );
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!triggerRef.current) return false;
        event?.preventDefault();
        const entry = entriesRef.current[activeIndexRef.current];
        if (entry) commitEntry(entry);
        else closeMenu();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    return () => {
      unregisterEscape();
      unregisterDown();
      unregisterUp();
      unregisterEnter();
    };
  }, [editor, closeMenu, commitEntry]);

  if (!trigger) return null;

  return (
    <SlashCommandMenu
      anchorRect={trigger.anchorRect}
      query={trigger.query}
      entries={entries}
      activeIndex={activeIndex}
      onHover={setActiveIndex}
      onCommit={commitEntry}
      onClose={closeMenu}
    />
  );
}
