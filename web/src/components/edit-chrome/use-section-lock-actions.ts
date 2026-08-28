"use client";

import { useCallback, useMemo, type RefObject } from "react";

import {
  runEjectSection,
  runRepairSectionStyling,
  runUnejectSection,
} from "./eject-lossless";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type { EditContextValue } from "./edit-context-types";

/**
 * The three doors between a curated section and freeform blocks, in one place.
 *
 *   Unlock  — `ejectSection`: curated component out, editable blocks in.
 *             Lossless (saved per-role styling AND the curated CSS baseline are
 *             carried onto the children) and reversible.
 *   Relock  — `unejectSection`: curated design back, DESTROYING the blocks.
 *             Callers confirm first.
 *   Restore — `repairSectionStyling`: curated styling back, KEEPING the blocks.
 *             The retroactive fix for every section unlocked before the
 *             eject-time baseline bake existed; see section-eject-repair.ts.
 *
 * Peeled out of edit-context.tsx (size ratchet) as one coherent group rather
 * than three unrelated callbacks: they share the commit spine, and the third
 * only makes sense read against the other two.
 */
export function useSectionLockActions(input: {
  builderTreeRef: RefObject<BuilderNodeTree>;
  executeBuilderNodeOperation: Parameters<typeof runEjectSection>[2];
  queueRouterRefresh: () => Promise<void>;
}): Pick<
  EditContextValue,
  "ejectSection" | "unejectSection" | "repairSectionStyling"
> {
  const { builderTreeRef, executeBuilderNodeOperation, queueRouterRefresh } =
    input;

  const ejectSection = useCallback<EditContextValue["ejectSection"]>(
    (id) =>
      runEjectSection(builderTreeRef.current, id, executeBuilderNodeOperation),
    [builderTreeRef, executeBuilderNodeOperation],
  );

  const repairSectionStyling = useCallback<
    EditContextValue["repairSectionStyling"]
  >(
    (id) =>
      runRepairSectionStyling(
        builderTreeRef.current,
        id,
        executeBuilderNodeOperation,
      ),
    [builderTreeRef, executeBuilderNodeOperation],
  );

  const unejectSection = useCallback<EditContextValue["unejectSection"]>(
    async (id) => {
      const result = await runUnejectSection(id, executeBuilderNodeOperation);
      // Relock repaints only server-side: the curated component is a server
      // render the client canvas cannot restore, so without a refresh the
      // unlocked look persists until a manual reload and relock appears to have
      // failed. Restore needs no refresh — an ejected section is already
      // client-rendered from the very nodes it just restyled.
      if (result.ok && result.ejected) void queueRouterRefresh();
      return result;
    },
    [executeBuilderNodeOperation, queueRouterRefresh],
  );

  return useMemo(
    () => ({ ejectSection, unejectSection, repairSectionStyling }),
    [ejectSection, unejectSection, repairSectionStyling],
  );
}
