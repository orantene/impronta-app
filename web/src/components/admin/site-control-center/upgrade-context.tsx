"use client";

import * as React from "react";

/**
 * UpgradeModalContext — shared open-state for the "Choose your plan"
 * modal. Provider lives in the prototype shell so any admin surface
 * (tier-chip in the topbar, locked card drawers, tier-band CTAs) can
 * open the same modal.
 */
type Ctx = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const UpgradeModalContext = React.createContext<Ctx | null>(null);

export function UpgradeModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
    </UpgradeModalContext.Provider>
  );
}

/** Returns the modal state. Safe to call from any descendant of provider. */
export function useUpgradeModal(): Ctx {
  const ctx = React.useContext(UpgradeModalContext);
  if (!ctx) {
    return {
      open: false,
      setOpen: () => {
        /* no-op when outside provider */
      },
    };
  }
  return ctx;
}
