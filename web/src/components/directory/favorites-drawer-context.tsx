"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type FavoritesDrawerContextValue = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  open: () => void;
  close: () => void;
};

const FavoritesDrawerContext =
  createContext<FavoritesDrawerContextValue | null>(null);

export function FavoritesDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<FavoritesDrawerContextValue>(
    () => ({
      isOpen,
      setOpen: setIsOpen,
      open,
      close,
    }),
    [isOpen, open, close],
  );

  return (
    <FavoritesDrawerContext.Provider value={value}>
      {children}
    </FavoritesDrawerContext.Provider>
  );
}

/**
 * Safe access — returns `null` when no provider is mounted (e.g.
 * talent-dashboard preview surfaces) so the header icon can degrade to
 * a no-op rather than throwing.
 */
export function useFavoritesDrawer(): FavoritesDrawerContextValue | null {
  return useContext(FavoritesDrawerContext);
}
