"use client";

/**
 * Mount fact: the first-paint orientation tip sits at the bottom of the canvas
 * instead of under the top bar. Talent mounts provide it so the tip never
 * covers the talent's site header; every other surface keeps the default.
 */
import { createContext, useContext, type ReactNode } from "react";

const FirstPaintTipBottomContext = createContext(false);

export function FirstPaintTipBottomProvider({ children }: { children: ReactNode }) {
  return <FirstPaintTipBottomContext.Provider value>{children}</FirstPaintTipBottomContext.Provider>;
}

export function useFirstPaintTipAtBottom(): boolean {
  return useContext(FirstPaintTipBottomContext);
}
