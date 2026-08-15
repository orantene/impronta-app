"use client";

/**
 * Lane E (2026) — builds the "/" insert-menu config for `InlineEditor`'s
 * active canvas text edit. Extracted out of `inline-editor.tsx` (max-lines
 * budget) rather than inlined — same reasoning as `use-inline-text-commit.ts`
 * and `inline-text-arming.ts` living next to it.
 *
 * `useEditContext()` (insert plumbing) only exists up at `InlineEditor`'s
 * level, so this hook resolves the anchor + performs the actual insert
 * itself; the Lexical layer (`SlashCommandPlugin.tsx`) only ever sees the
 * resulting `onPick*` callbacks.
 */

import { useCallback, useMemo } from "react";

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import type { InlineBuilderNodeTextTarget } from "./use-inline-text-commit";
import type { SlashCommandInsertConfig } from "./rich-editor/plugins/SlashCommandPlugin";
import { resolveInsertAnchor } from "./add-gallery/gallery-insert-hint";
import { getViewportSectionNodeId } from "./add-gallery/viewport-section-anchor";
import { allowedKindsForInsertParent } from "./slash-command-insert-target";
import { locateCanvasNode } from "./freeform-layer-row";

export interface UseInlineEditorSlashCommandInput {
  /** The builder-node text currently being edited, or `undefined`/absent
   *  for the legacy CMS-section path (no reliable insert-after anchor). */
  target: InlineBuilderNodeTextTarget | undefined;
  builderTree: BuilderNodeTree;
  advancedElementLibraryEnabled: boolean;
  canInsertRawHtmlElements: boolean;
  insertBuilderNode: (
    parentId: string | null,
    kind: import("@/lib/site-admin/builder-node").BuilderNodeKind,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  insertBuilderSectionEmbed: (
    parentId: string | null,
    sectionTypeKey: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  insertBuilderComponent: (
    parentId: string | null,
    subtreeJson: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  reportMutationError: (message: string) => void;
  selectBuilderNode: (nodeId: string) => void;
}

/**
 * Gated to plain prose fields — omitted for `sectionEmbedConfigKey` edits (a
 * structured config label, not a paragraph an operator would naturally
 * continue from) and, by the caller only passing `target` for the freeform
 * builder-node path, for legacy CMS-section text.
 */
export function useInlineEditorSlashCommand(
  input: UseInlineEditorSlashCommandInput,
): SlashCommandInsertConfig | undefined {
  const {
    target,
    builderTree,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    reportMutationError,
    selectBuilderNode,
  } = input;

  const afterInsert = useCallback(
    (result: { ok: boolean; error?: string; nodeId?: string }) => {
      if (!result.ok) {
        if (result.error) reportMutationError(result.error);
        return;
      }
      if (result.nodeId) {
        selectBuilderNode(result.nodeId);
        locateCanvasNode(result.nodeId);
      }
    },
    [reportMutationError, selectBuilderNode],
  );

  return useMemo<SlashCommandInsertConfig | undefined>(() => {
    if (!target || target.sectionEmbedConfigKey) return undefined;
    const anchor = resolveInsertAnchor(builderTree, target.id, getViewportSectionNodeId());
    const allowedKinds = allowedKindsForInsertParent(
      builderTree,
      anchor.parentId,
      advancedElementLibraryEnabled,
      canInsertRawHtmlElements,
    );
    return {
      allowedKinds,
      includeSectionEmbeds: allowedKinds.includes("section_embed"),
      onPickElement: (kind) => {
        void insertBuilderNode(anchor.parentId, kind, anchor.index).then(afterInsert);
      },
      onPickSectionEmbed: (sectionTypeKey) => {
        void insertBuilderSectionEmbed(anchor.parentId, sectionTypeKey, anchor.index).then(
          afterInsert,
        );
      },
      onPickSavedBlock: (block) => {
        void insertBuilderComponent(
          anchor.parentId,
          JSON.stringify(block.subtree),
          anchor.index,
        ).then(afterInsert);
      },
    };
  }, [
    target?.id,
    target?.sectionEmbedConfigKey,
    builderTree,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    afterInsert,
  ]);
}
