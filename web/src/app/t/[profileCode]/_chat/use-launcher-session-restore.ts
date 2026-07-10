"use client";

/**
 * useLauncherSessionRestore — B1: restore the open panel across a refresh via
 * sessionStorage (per-tab; only when a LIVE thread exists, never auto-opens an
 * empty intro chat). Extracted verbatim from TalentProfileChatLauncher.tsx
 * (W1-A decomposition pre-pass) to keep that file under the 800-line cap. No
 * logic changes.
 */

import { useEffect, type Dispatch, type SetStateAction } from "react";

export function useLauncherSessionRestore({
  existingInquiryId,
  talentProfileId,
  open,
  setOpen,
}: {
  existingInquiryId: string | null;
  talentProfileId: string;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  // Restore the open panel across a refresh (B1) so the conversation doesn't
  // appear to reset. sessionStorage is per-tab → a refresh restores; closing the
  // tab forgets. Only auto-restore when there's a LIVE thread to show — never
  // auto-open an empty intro chat, which would read as spammy (strategy §10).
  const openStateKey = `tulala_guestchat_open:${talentProfileId}`;
  useEffect(() => {
    if (!existingInquiryId) return;
    try {
      if (sessionStorage.getItem(openStateKey) === "1") setOpen(true);
    } catch {
      /* sessionStorage blocked (some privacy modes) — stay closed, no-op. */
    }
    // existingInquiryId + openStateKey are stable for a given mount, so this
    // restores once and never re-opens after the user manually closes.
  }, [existingInquiryId, openStateKey, setOpen]);
  useEffect(() => {
    try {
      if (open) sessionStorage.setItem(openStateKey, "1");
      else sessionStorage.removeItem(openStateKey);
    } catch {
      /* ignore — persistence is best-effort. */
    }
  }, [open, openStateKey]);
}
