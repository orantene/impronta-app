"use client";

/**
 * useRegisterRemoveTalentRunner — B6: registers the unified talent-patch
 * runner up to the launcher so the rail X-remove writes the record through the
 * SAME useUnifiedInquiry.patch path the in-chat ADD uses. Extracted verbatim
 * from MiniChatPanel.tsx (W1-A decomposition pre-pass) to keep that file under
 * the 800-line cap. No logic changes.
 */

import { useEffect, type MutableRefObject } from "react";

import type { UnifiedInquiryPatch } from "./use-unified-inquiry";
import type { MiniChatPanelLocalProps } from "./mini-chat-panel-props";

export function useRegisterRemoveTalentRunner({
  onRegisterRemoveTalent,
  patch,
  lastPatchRef,
}: {
  onRegisterRemoveTalent?: MiniChatPanelLocalProps["onRegisterRemoveTalent"];
  patch: (p: UnifiedInquiryPatch) => Promise<void>;
  lastPatchRef: MutableRefObject<UnifiedInquiryPatch | null>;
}) {
  useEffect(() => {
    if (!onRegisterRemoveTalent) return;
    onRegisterRemoveTalent(
      (
        selectedIds: string[],
        selectionMode: "i_know_who" | "agency_recommends",
        selectedNames: string[],
      ) => {
        lastPatchRef.current = { kind: "talent", selectedIds, selectionMode, selectedNames };
        void patch({ kind: "talent", selectedIds, selectionMode, selectedNames });
      },
    );
    return () => onRegisterRemoveTalent(null);
  }, [onRegisterRemoveTalent, patch]);
}
