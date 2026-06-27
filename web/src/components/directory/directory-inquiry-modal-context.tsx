"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  success: InquirySuccessParams | null;
  showSuccess: (params: InquirySuccessParams) => void;
  clearSuccess: () => void;
};

const DirectoryInquiryModalContext =
  createContext<DirectoryInquiryModalContextValue | null>(null);

export function DirectoryInquiryModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saveCue, setSaveCue] = useState(0);
  const [lastAnimateAdd, setLastAnimateAdd] = useState<AnimateAddPayload | null>(null);
  const [success, setSuccess] = useState<InquirySuccessParams | null>(null);

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
      success,
      showSuccess,
      clearSuccess,
    }),
    [open, openInquiry, saveCue, bumpSaveCue, animateAdd, lastAnimateAdd, success, showSuccess, clearSuccess],
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
