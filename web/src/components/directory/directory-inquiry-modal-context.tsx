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

  const registerChatLauncher = useCallback(() => {
    chatLauncherCount.current += 1;
    return () => {
      chatLauncherCount.current = Math.max(0, chatLauncherCount.current - 1);
    };
  }, []);

  const requestOpenChat = useCallback(() => {
    if (chatLauncherCount.current > 0) {
      setOpenChatCue((n) => n + 1);
      return;
    }
    // No chat launcher mounted — open the legacy sheet so the control still has
    // a destination (the sheet binds to the same shared cart, so the lineup is
    // preserved; it is the synced form-view of the same inquiry).
    setSuccess(null);
    setOpen(true);
  }, []);

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
      registerChatLauncher,
      success,
      showSuccess,
      clearSuccess,
    }),
    [open, openInquiry, saveCue, bumpSaveCue, animateAdd, lastAnimateAdd, openChatCue, requestOpenChat, registerChatLauncher, success, showSuccess, clearSuccess],
  );

  return (
    <DirectoryInquiryModalContext.Provider value={value}>
      {children}
    </DirectoryInquiryModalContext.Provider>
  );
}

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
