"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type InquirySuccessParams = {
  email: string | null;
  activation: string | null;
};

/** DOCK v2.1 — "start a separate inquiry about {talent}" (profile CTA chooser). */
export type SeparateInquiryPayload = {
  talentProfileId: string;
  profileCode: string;
  displayName: string;
  portraitUrl: string | null;
};

/** Payload for the card-to-pill fly animation (§5.3). */
export type AnimateAddPayload = {
  fromRect: DOMRect;
  portraitUrl: string | null;
  talentProfileId: string;
};

type DirectoryInquiryModalContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openInquiry: () => void;
  /** Bump to play a short "you have something to send" cue on the inquiry control. */
  saveCue: number;
  bumpSaveCue: () => void;
  /** Trigger the card-to-pill fly animation; kept alongside bumpSaveCue for back-compat. */
  animateAdd: (payload: AnimateAddPayload) => void;
  /** The most-recent animateAdd payload, consumed by the FlyingAvatar host. Null when idle. */
  lastAnimateAdd: AnimateAddPayload | null;
  /**
   * Phase 3 — the canonical inquiry surface is the floating chat launcher, not
   * the InquiryDrawer sheet. The directory front doors (review bar, header Send
   * icon, ?inquiry=open URL trigger) bump this counter to ask the chat launcher
   * to open, preloaded with the current lineup. The launcher subscribes via
   * `openChatCue` and never spawns a parallel composer. Null/0 = idle.
   */
  openChatCue: number;
  /**
   * Ask the floating chat launcher to open (the one canonical inquiry surface).
   * When NO chat launcher is mounted on this surface (e.g. a tenant with guest
   * chat disabled), this falls back to opening the legacy InquiryDrawer sheet so
   * the control is never a dead CTA.
   */
  requestOpenChat: () => void;
  /**
   * DOCK v2.1 — ask the chat launcher to mint a SEPARATE draft about one
   * talent (forceNew ensure; the in-progress draft stays parked + autosaved and
   * remains reachable from the Inquiries tab). Falls back to requestOpenChat
   * when no launcher is mounted.
   */
  requestSeparateInquiry: (payload: SeparateInquiryPayload) => void;
  /** The launcher consumes this (seq bumps once per request). */
  separateInquiryRequest: { seq: number; payload: SeparateInquiryPayload } | null;
  /**
   * The chat launcher calls this on mount/unmount so requestOpenChat knows
   * whether a launcher is listening (and can otherwise fall back to the sheet).
   * Returns an unregister fn.
   */
  registerChatLauncher: () => () => void;
  success: InquirySuccessParams | null;
  showSuccess: (params: InquirySuccessParams) => void;
  clearSuccess: () => void;
};

const DirectoryInquiryModalContext =
  createContext<DirectoryInquiryModalContextValue | null>(null);

export function DirectoryInquiryModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saveCue, setSaveCue] = useState(0);
  const [openChatCue, setOpenChatCue] = useState(0);
  const [lastAnimateAdd, setLastAnimateAdd] = useState<AnimateAddPayload | null>(null);
  const [success, setSuccess] = useState<InquirySuccessParams | null>(null);

  // Count of mounted chat launchers listening for the open cue. When 0 there is
  // no canonical chat surface on this page, so requestOpenChat falls back to the
  // legacy InquiryDrawer sheet rather than no-op (no dead CTA).
  const chatLauncherCount = useRef(0);
  // ?inquiry=open is read by DirectoryInquiryUrlSync, which often sits ABOVE the
  // launcher in the tree (directory page, AgencyChatLauncherMount). Child effects
  // run after that sibling, so a synchronous fallback here opens the sheet and
  // never the chat. Queue until registerChatLauncher, then sheet only if nobody
  // registered this turn.
  const pendingOpenChat = useRef(false);
  const pendingSeparateInquiry = useRef<SeparateInquiryPayload | null>(null);
  const sheetFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [separateInquiryRequest, setSeparateInquiryRequest] = useState<{
    seq: number;
    payload: SeparateInquiryPayload;
  } | null>(null);

  const bumpSaveCue = useCallback(() => {
    setSaveCue((n) => n + 1);
  }, []);

  const animateAdd = useCallback((payload: AnimateAddPayload) => {
    setLastAnimateAdd(payload);
  }, []);

  const openInquiry = useCallback(() => {
    setSuccess(null);
    setOpen(true);
  }, []);

  const flushPendingChatOpen = useCallback(() => {
    if (sheetFallbackTimer.current) {
      clearTimeout(sheetFallbackTimer.current);
      sheetFallbackTimer.current = null;
    }
    if (pendingOpenChat.current) {
      pendingOpenChat.current = false;
      setOpenChatCue((n) => n + 1);
    }
    const separate = pendingSeparateInquiry.current;
    if (separate) {
      pendingSeparateInquiry.current = null;
      setSeparateInquiryRequest((prev) => ({ seq: (prev?.seq ?? 0) + 1, payload: separate }));
    }
  }, []);

  const registerChatLauncher = useCallback(() => {
    chatLauncherCount.current += 1;
    flushPendingChatOpen();
    return () => {
      chatLauncherCount.current = Math.max(0, chatLauncherCount.current - 1);
    };
  }, [flushPendingChatOpen]);

  const scheduleSheetFallback = useCallback(() => {
    if (sheetFallbackTimer.current) clearTimeout(sheetFallbackTimer.current);
    sheetFallbackTimer.current = setTimeout(() => {
      sheetFallbackTimer.current = null;
      if (chatLauncherCount.current > 0) {
        pendingOpenChat.current = false;
        pendingSeparateInquiry.current = null;
        return;
      }
      if (!pendingOpenChat.current && !pendingSeparateInquiry.current) return;
      pendingOpenChat.current = false;
      pendingSeparateInquiry.current = null;
      setSuccess(null);
      setOpen(true);
    }, 0);
  }, []);

  const requestSeparateInquiry = useCallback((payload: SeparateInquiryPayload) => {
    if (chatLauncherCount.current > 0) {
      setSeparateInquiryRequest((prev) => ({ seq: (prev?.seq ?? 0) + 1, payload }));
      return;
    }
    pendingSeparateInquiry.current = payload;
    scheduleSheetFallback();
  }, [scheduleSheetFallback]);

  const requestOpenChat = useCallback(() => {
    if (chatLauncherCount.current > 0) {
      setOpenChatCue((n) => n + 1);
      return;
    }
    pendingOpenChat.current = true;
    scheduleSheetFallback();
  }, [scheduleSheetFallback]);

  const showSuccess = useCallback((params: InquirySuccessParams) => {
    setSuccess(params);
    setOpen(true);
  }, []);

  const clearSuccess = useCallback(() => {
    setSuccess(null);
  }, []);

  const value = useMemo<DirectoryInquiryModalContextValue>(
    () => ({
      open,
      setOpen,
      openInquiry,
      saveCue,
      bumpSaveCue,
      animateAdd,
      lastAnimateAdd,
      openChatCue,
      requestOpenChat,
      requestSeparateInquiry,
      separateInquiryRequest,
      registerChatLauncher,
      success,
      showSuccess,
      clearSuccess,
    }),
    [open, openInquiry, saveCue, bumpSaveCue, animateAdd, lastAnimateAdd, openChatCue, requestOpenChat, requestSeparateInquiry, separateInquiryRequest, registerChatLauncher, success, showSuccess, clearSuccess],
  );

  return (
    <DirectoryInquiryModalContext.Provider value={value}>
      {children}
    </DirectoryInquiryModalContext.Provider>
  );
}

/**
 * The context when a provider is above us, or NULL when there is none.
 *
 * ─── WHY AN OPTIONAL READ EXISTS AT ALL ─────────────────────────────────────
 *
 * `useDirectoryInquiryModal` THROWS without a provider, and that throw took
 * down public pages 61 times between 2026-09-03 and 2026-09-05 across `/`,
 * `/global-directory` and `/_not-found`, thrown during SERVER RENDER.
 *
 * The structural reason is simple and was never going to be fixed by mounting
 * one more provider: **the ROOT layout mounts none.** `(marketing)/layout.tsx`
 * and `(public)/layout.tsx` each mount one, but anything rendering under the
 * root layout — `/`, and `/_not-found`, which cannot be given a route group —
 * has no provider by construction and no place to put one that a future route
 * could not escape again.
 *
 * So the components that ride along on arbitrary pages read the context
 * OPTIONALLY and degrade, while components that genuinely cannot work without
 * it keep the throwing hook. Absence stays structurally distinct — `null`, not
 * a fake context object whose setters quietly do nothing — because a no-op
 * context is exactly the "one value, two meanings" defect that hides a broken
 * modal behind a working-looking page.
 */
export function useDirectoryInquiryModal(): DirectoryInquiryModalContextValue {
  const ctx = useContext(DirectoryInquiryModalContext);
  if (!ctx) {
    throw new Error(
      "useDirectoryInquiryModal must be used within DirectoryInquiryModalProvider",
    );
  }
  return ctx;
}

export function useOptionalDirectoryInquiryModal(): DirectoryInquiryModalContextValue | null {
  return useContext(DirectoryInquiryModalContext);
}
