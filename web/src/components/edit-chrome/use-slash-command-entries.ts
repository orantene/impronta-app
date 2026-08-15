"use client";

/**
 * Slash-command insert — the live entry list for an open menu.
 *
 * Shared by `SlashCommandPlugin.tsx` (text-caret trigger) and
 * `slash-command-canvas-trigger.tsx` (selected-block trigger). Fetches the
 * operator's saved "My blocks" once per open (mirrors the ⌘K command
 * palette's `savedBlocks` effect — see `command-palette.tsx`), then filters
 * the combined catalog against `query` on every keystroke without
 * refetching.
 */

import { useEffect, useMemo, useState } from "react";

import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";
import {
  listBuilderComponents,
  type BuilderComponentRow,
} from "@/lib/site-admin/edit-mode/builder-components-action";
import {
  buildSlashCommandEntries,
  filterSlashCommandEntries,
  type SlashCommandEntry,
} from "./slash-command-catalog";

export function useSlashCommandEntries(input: {
  /** Only fetches "My blocks" while the menu is actually open. */
  enabled: boolean;
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  includeSectionEmbeds: boolean;
  query: string;
}): ReadonlyArray<SlashCommandEntry> {
  const [savedBlocks, setSavedBlocks] = useState<
    ReadonlyArray<BuilderComponentRow>
  >([]);

  useEffect(() => {
    if (!input.enabled) return;
    let cancelled = false;
    void listBuilderComponents().then((res) => {
      if (!cancelled && res.ok) setSavedBlocks(res.components);
    });
    return () => {
      cancelled = true;
    };
  }, [input.enabled]);

  const allEntries = useMemo(
    () =>
      buildSlashCommandEntries({
        allowedKinds: input.allowedKinds,
        includeSectionEmbeds: input.includeSectionEmbeds,
        savedBlocks: input.enabled ? savedBlocks : [],
      }),
    [input.allowedKinds, input.includeSectionEmbeds, input.enabled, savedBlocks],
  );

  return useMemo(
    () => filterSlashCommandEntries(allEntries, input.query),
    [allEntries, input.query],
  );
}
