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

type DirectoryInquiryModalContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openInquiry: () => void;
  /** Bump to play a short “you have something to send” cue on the inquiry control. */
  saveCue: number;
  bumpSaveCue: () => void;
  success: InquirySuccessParams | null;
  showSuccess: (params: InquirySuccessParams) => void;
  clearSuccess: () => void;
};

const DirectoryInquiryModalContext =
  createContext<DirectoryInquiryModalContextValue | null>(null);

export function DirectoryInquiryModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saveCue, setSaveCue] = useState(0);
  const [success, setSuccess] = useState<InquirySuccessParams | null>(null);

  const bumpSaveCue = useCallback(() => {
    setSaveCue((n) => n + 1);
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
      success,
      showSuccess,
      clearSuccess,
    }),
    [open, openInquiry, saveCue, bumpSaveCue, success, showSuccess, clearSuccess],
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
