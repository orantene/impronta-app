"use client";

/**
 * useDirectoryFrontDoorSync — Phase 3: announce this launcher to the shared
 * directory-inquiry-modal context (so a repointed front door's
 * requestOpenChat() targets the chat surface) and open the panel when a
 * repointed front door bumps its openChatCue. Extracted verbatim from
 * TalentProfileChatLauncher.tsx (W1-A decomposition pre-pass) to keep that
 * file under the 800-line cap. No logic changes.
 */

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

export function useDirectoryFrontDoorSync({
  registerChatLauncher,
  openChatCue,
  setOpen,
}: {
  registerChatLauncher: (() => () => void) | undefined;
  openChatCue: number;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  // Phase 3 — announce this launcher to the shared modal context so a repointed
  // front door's requestOpenChat() targets the chat surface (and falls back to
  // the legacy sheet only when no launcher is mounted).
  useEffect(() => {
    if (!registerChatLauncher) return;
    return registerChatLauncher();
  }, [registerChatLauncher]);

  // Phase 3 — open this panel when a repointed directory front door asks for it
  // (the cue is a monotonically-increasing counter; the initial 0 is ignored so
  // the panel never auto-opens on mount). This is what makes the chat launcher
  // the single canonical inquiry surface.
  const lastOpenChatCue = useRef(openChatCue);
  useEffect(() => {
    if (openChatCue === 0) return;
    if (openChatCue === lastOpenChatCue.current) return;
    lastOpenChatCue.current = openChatCue;
    setOpen(true);
  }, [openChatCue, setOpen]);
}
